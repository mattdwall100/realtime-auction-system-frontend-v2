"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listMyAuctions, type AuctionSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { centsToDisplay } from "@/lib/money";

const POLL_INTERVAL_MS = 10_000;

function summaryLine(auction: AuctionSummary): string {
  if (auction.status === "ended") {
    return auction.high_bidder_identifier
      ? `Ended · won by ${auction.high_bidder_identifier} for ${centsToDisplay(
          auction.current_bid_cents
        )}`
      : "Ended · no bids";
  }
  return auction.high_bidder_identifier
    ? `Active · ${centsToDisplay(auction.current_bid_cents)} · high bidder: ${
        auction.high_bidder_identifier
      }`
    : `Active · ${centsToDisplay(auction.current_bid_cents)} · no bids yet`;
}

export default function MyAuctions({ refreshKey }: { refreshKey: number }) {
  const { token } = useAuth();
  const [auctions, setAuctions] = useState<AuctionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      try {
        const data = await listMyAuctions(token!);
        if (cancelled) return;
        setAuctions(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load your auctions.");
      }
    }

    load();
    const intervalId = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [token, refreshKey]);

  return (
    <div className="card stack">
      <h2>Your auctions</h2>
      {error && <div className="banner banner-error">{error}</div>}
      {auctions === null ? (
        <p className="muted">Loading...</p>
      ) : auctions.length === 0 ? (
        <p className="muted">You haven&apos;t created any auctions yet.</p>
      ) : (
        <ul className="auction-list">
          {auctions.map((auction) => (
            <li key={auction.id}>
              <div>
                <div className="auction-list-name">{auction.item_name}</div>
                <div className="bid-meta">{summaryLine(auction)}</div>
              </div>
              <Link className="button" href={`/auctions/${auction.id}`}>
                View
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
