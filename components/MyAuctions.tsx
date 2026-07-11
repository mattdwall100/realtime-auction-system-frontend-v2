"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listMyAuctions, type AuctionSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { centsToDisplay } from "@/lib/money";

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
  const { isAuthenticated } = useAuth();
  const [auctions, setAuctions] = useState<AuctionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // No polling: loads once and refetches when refreshKey changes (e.g. after
  // creating an auction). Anything newer arrives on page refresh.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    async function load() {
      try {
        const data = await listMyAuctions();
        if (cancelled) return;
        setAuctions(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load your auctions.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, refreshKey]);

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
