"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listWonAuctions, type AuctionSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { centsToDisplay } from "@/lib/money";

export default function WinningBids() {
  const { isAuthenticated } = useAuth();
  const [wins, setWins] = useState<AuctionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // No polling: loads once per visit; anything newer arrives on page refresh.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    async function load() {
      try {
        const data = await listWonAuctions();
        if (cancelled) return;
        setWins(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load your wins.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return (
    <div className="card stack">
      <h2>Your winning bids</h2>
      {error && <div className="banner banner-error">{error}</div>}
      {wins === null ? (
        <p className="muted">Loading...</p>
      ) : wins.length === 0 ? (
        <p className="muted">You haven&apos;t won any auctions yet.</p>
      ) : (
        <ul className="auction-list">
          {wins.map((auction) => (
            <li key={auction.id}>
              <div>
                <div className="auction-list-name">{auction.item_name}</div>
                <div className="bid-meta">
                  Won for {centsToDisplay(auction.current_bid_cents)} ·{" "}
                  {new Date(auction.end_time).toLocaleString()}
                </div>
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
