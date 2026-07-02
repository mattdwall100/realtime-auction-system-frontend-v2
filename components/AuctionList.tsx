"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { listAuctions, type AuctionSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { centsToDisplay } from "@/lib/money";

const POLL_INTERVAL_MS = 3000;

export default function AuctionList({ refreshKey }: { refreshKey: number }) {
  const { token } = useAuth();
  const [auctions, setAuctions] = useState<AuctionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await listAuctions("active", tokenRef.current);
        if (cancelled) return;
        setAuctions(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load auctions.");
      }
    }

    load();
    const intervalId = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
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
