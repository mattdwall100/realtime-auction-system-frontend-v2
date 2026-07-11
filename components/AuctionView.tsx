"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { type AuctionState } from "@/lib/api";
import { useAuctionStream } from "@/lib/useAuctionStream";
import { useToast } from "@/lib/toast";
import { centsToDisplay } from "@/lib/money";
import { computeServerOffsetMs, shouldRebaseOffset } from "@/lib/time";
import CountdownTimer from "./CountdownTimer";
import BidForm from "./BidForm";
import BidHistory from "./BidHistory";

export default function AuctionView() {
  const params = useParams<{ id: string }>();
  const auctionId = params.id;
  const { notify } = useToast();

  // Live state arrives over SSE (see lib/useAuctionStream.ts): update events
  // whenever the auction changes in the database, pings in between, and an
  // automatic reconnect when the stream goes silent.
  const { auction, isLoading, notFound, loadError, isReconnecting, applyState } =
    useAuctionStream(auctionId);

  const [serverOffsetMs, setServerOffsetMs] = useState(0);

  // Each state carries a fresh server-time sample, but the estimate wobbles
  // with network latency. Only rebase the countdown when the estimate moves
  // beyond the drift threshold, so the visible timer doesn't jitter on every
  // event (see lib/time.ts for the strategy).
  const offsetRef = useRef<number | null>(null);

  // Show the win/lose popup exactly once, only to a viewer who actually bid.
  const resultShownRef = useRef(false);
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  // Bid-status notifications are transient toasts fired on *transitions* of
  // the viewer flags (not persistent banners): becoming the highest bidder →
  // green, being outbid → yellow. The previous flags are tracked so a toast
  // fires once per change, not on every streamed update.
  const prevViewerFlagsRef = useRef<{ isHighBidder: boolean; hasBeenOutbid: boolean } | null>(
    null
  );

  function maybeAnnounceBidStatus(state: AuctionState) {
    const viewer = state.viewer;
    if (!viewer || state.status !== "active") return;
    const prev = prevViewerFlagsRef.current;
    if (viewer.has_been_outbid && !prev?.hasBeenOutbid) {
      notifyRef.current("You've been outbid!", "warning");
    }
    if (viewer.is_high_bidder && !prev?.isHighBidder) {
      notifyRef.current("You are the highest bidder", "success");
    }
    prevViewerFlagsRef.current = {
      isHighBidder: viewer.is_high_bidder,
      hasBeenOutbid: viewer.has_been_outbid,
    };
  }

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

  // React to every new state, whether it arrived via SSE or a bid response.
  useEffect(() => {
    if (!auction) return;
    const next = computeServerOffsetMs(auction.server_time);
    if (shouldRebaseOffset(offsetRef.current, next)) {
      offsetRef.current = next;
      setServerOffsetMs(next);
    }
    maybeAnnounceBidStatus(auction);
    maybeAnnounceResult(auction);
  }, [auction]);

  if (isLoading) {
    return <p className="muted">Loading auction...</p>;
  }

  if (notFound) {
    return <div className="banner banner-error">Auction not found.</div>;
  }

  if (!auction) {
    return (
      <div className="banner banner-error">{loadError ?? "Something went wrong."}</div>
    );
  }

  const isEnded = auction.status === "ended";
  const hasWinner = isEnded && Boolean(auction.high_bidder_identifier);

  return (
    <div className="stack">
      {isReconnecting && !isEnded && (
        <div className="banner banner-warning">
          Connection to the live feed lost — reconnecting...
        </div>
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
        onBidPlaced={applyState}
      />

      <div className="card stack">
        <h2>Bid history</h2>
        <BidHistory bids={auction.bid_history} />
      </div>
    </div>
  );
}
