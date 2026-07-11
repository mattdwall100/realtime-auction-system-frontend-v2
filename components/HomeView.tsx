"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import CreateAuctionForm from "./CreateAuctionForm";
import AuctionList from "./AuctionList";
import MyAuctions from "./MyAuctions";
import WinningBids from "./WinningBids";

// The live-auctions list is public (GET /auctions needs no auth), so the home
// page is browsable without logging in — auth only gates creating auctions and
// the personal lists. Bidding is gated on the auction page itself.
export default function HomeView() {
  const { isAuthenticated, isReady } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  if (!isReady) {
    return <p className="muted">Loading...</p>;
  }

  if (!isAuthenticated) {
    return (
      <div className="stack">
        <div className="card stack">
          <h1>Live auctions</h1>
          <p className="muted">
            Browse freely — <Link href="/login">log in</Link> or{" "}
            <Link href="/register">register</Link> to create auctions and place
            bids.
          </p>
        </div>
        <AuctionList refreshKey={refreshKey} />
      </div>
    );
  }

  return (
    <div className="stack">
      <CreateAuctionForm onCreated={() => setRefreshKey((key) => key + 1)} />
      <AuctionList refreshKey={refreshKey} />
      <MyAuctions refreshKey={refreshKey} />
      <WinningBids />
    </div>
  );
}
