"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError, getAuction, type AuctionState } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { centsToDisplay } from "@/lib/money";
import { computeServerOffsetMs } from "@/lib/time";
import CountdownTimer from "./CountdownTimer";
import BidForm from "./BidForm";
import BidHistory from "./BidHistory";

const POLL_INTERVAL_MS = 1000;

export default function AuctionView() {
  const params = useParams<{ id: string }>();
  const auctionId = params.id;
  const { token } = useAuth();
  const { notify } = useToast();

  const [auction, setAuction] = useState<AuctionState | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);

  // Polling always uses the latest token without re-subscribing the interval.
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // Show the win/lose popup exactly once, only to a viewer who actually bid.
  const resultShownRef = useRef(false);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  function maybeAnnounceResult(state: AuctionState) {
    if (resultShownRef.current) return;
    if (state.status !== "ended" || !state.viewer) return;

    // The auction owner gets a completion notice (they can't bid, so they are
    // never the winner/loser): green when someone won, yellow when no one bid.
    if (state.viewer.internal_user_id === state.created_by_user_id) {
      resultShownRef.current = true;
      if (state.high_bidder_identifier) {
        notifyRef.current(
          `Your bid is completed: ${state.high_bidder_identifier} won the bid for ${centsToDisplay(
            state.current_bid_cents
          )}`,
          "success"
        );
      } else {
        notifyRef.current("Your bid is completed: Nobody bought the item :(", "warning");
      }
      return;
    }

    // Bidders get a win/lose result; pure spectators get nothing.
    if (!state.viewer.has_bid) return;
    resultShownRef.current = true;
    if (state.viewer.is_winner) {
      notifyRef.current("Congratulations, you have won the auction", "success");
    } else {
      notifyRef.current("Sorry, you didn't win this time", "error");
    }
  }

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const state = await getAuction(auctionId, tokenRef.current);
        if (cancelled) return;
        setAuction(state);
        setServerOffsetMs(computeServerOffsetMs(state.server_time));
        setNotFound(false);
        setPollError(null);
        setIsLoading(false);
        maybeAnnounceResult(state);
        if (state.status === "ended" && intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          setIsLoading(false);
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          return;
        }
        setPollError(
          err instanceof ApiError ? err.message : "Could not reach the server."
        );
        setIsLoading(false);
      }
    }

    poll();
    intervalId = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [auctionId]);

  if (isLoading) {
    return <p className="muted">Loading auction...</p>;
  }

  if (notFound) {
    return <div className="banner banner-error">Auction not found.</div>;
  }

  if (!auction) {
    return (
      <div className="banner banner-error">{pollError ?? "Something went wrong."}</div>
    );
  }

  const isEnded = auction.status === "ended";
  const hasWinner = isEnded && Boolean(auction.high_bidder_identifier);

  return (
    <div className="stack">
      {pollError && (
        <div className="banner banner-warning">{pollError} (retrying...)</div>
      )}

      <div className="card stack">
        <div className="status-row">
          <span className={`status-dot${isEnded ? " ended" : ""}`} />
          <span>{isEnded ? "Ended" : "Active"}</span>
        </div>
        <h1>{auction.item_name}</h1>
        {auction.created_by_identifier && (
          <p className="muted">
            Listed by <strong>{auction.created_by_identifier}</strong>
            {auction.viewer?.internal_user_id === auction.created_by_user_id
              ? " (you)"
              : null}
          </p>
        )}
        <div className="bid-amount">{centsToDisplay(auction.current_bid_cents)}</div>
        <p className="muted">
          {auction.high_bidder_identifier
            ? `High bidder: ${auction.high_bidder_identifier}`
            : "No bids yet"}
        </p>
        <CountdownTimer
          endTime={auction.end_time}
          serverOffsetMs={serverOffsetMs}
          status={auction.status}
        />
      </div>

      {auction.viewer?.has_been_outbid && !isEnded && (
        <div className="banner banner-warning">You&apos;ve been outbid!</div>
      )}

      {isEnded && (
        <div className={`banner ${hasWinner ? "banner-success" : "banner-warning"}`}>
          {hasWinner ? (
            <>
              Auction ended — Winner: <strong>{auction.high_bidder_identifier}</strong>{" "}
              at {centsToDisplay(auction.current_bid_cents)}
              {auction.viewer?.is_winner ? " (that's you!)" : null}
            </>
          ) : (
            "Auction ended with no bids."
          )}
        </div>
      )}

      <BidForm
        auctionId={auction.id}
        currentBidCents={auction.current_bid_cents}
        status={auction.status}
        onBidPlaced={(state) => {
          setAuction(state);
          setServerOffsetMs(computeServerOffsetMs(state.server_time));
        }}
      />

      <div className="card stack">
        <h2>Bid history</h2>
        <BidHistory bids={auction.bid_history} />
      </div>
    </div>
  );
}
