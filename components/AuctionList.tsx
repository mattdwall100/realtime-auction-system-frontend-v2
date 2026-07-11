"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listAuctions, type AuctionSummary } from "@/lib/api";
import { centsToDisplay } from "@/lib/money";

export default function AuctionList({ refreshKey }: { refreshKey: number }) {
  const [auctions, setAuctions] = useState<AuctionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // No polling: the list loads once and refetches when refreshKey changes
  // (e.g. after creating an auction). Anything newer arrives on page refresh.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await listAuctions("active");
        if (cancelled) return;
        setAuctions(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load auctions.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <div className="card stack">
      <h2>Live auctions</h2>
      {error && <div className="banner banner-error">{error}</div>}
      {auctions === null ? (
        <p className="muted">Loading...</p>
      ) : auctions.length === 0 ? (
        <p className="muted">No live auctions right now. Create one above.</p>
      ) : (
        <ul className="auction-list">
          {auctions.map((auction) => (
            <li key={auction.id}>
              <div>
                <div className="auction-list-name">{auction.item_name}</div>
                <div className="bid-meta">
                  {centsToDisplay(auction.current_bid_cents)}
                  {auction.high_bidder_identifier
                    ? ` · high bidder: ${auction.high_bidder_identifier}`
                    : " · no bids yet"}
                </div>
              </div>
              <Link className="button" href={`/auctions/${auction.id}`}>
                Join
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
