"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import CreateAuctionForm from "./CreateAuctionForm";
import AuctionList from "./AuctionList";
import MyAuctions from "./MyAuctions";
import WinningBids from "./WinningBids";

export default function HomeView() {
  const { token, isReady } = useAuth();
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (isReady && !token) {
      router.replace("/login?next=/");
    }
  }, [isReady, token, router]);

  if (!isReady) {
    return <p className="muted">Loading...</p>;
  }

  // Redirecting to /login; render nothing to avoid flashing protected content.
  if (!token) {
    return null;
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
