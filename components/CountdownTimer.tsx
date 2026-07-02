"use client";

import { useEffect, useState } from "react";
import { formatRemaining } from "@/lib/time";

interface CountdownTimerProps {
  endTime: string;
  serverOffsetMs: number;
  status: "active" | "ended";
}

export default function CountdownTimer({
  endTime,
  serverOffsetMs,
  status,
}: CountdownTimerProps) {
  const [remainingMs, setRemainingMs] = useState(
    () => new Date(endTime).getTime() - (Date.now() + serverOffsetMs)
  );

  useEffect(() => {
    function tick() {
      setRemainingMs(new Date(endTime).getTime() - (Date.now() + serverOffsetMs));
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endTime, serverOffsetMs]);

  if (status === "ended") {
    return <div className="countdown">Auction ended</div>;
  }

  const isEndingSoon = remainingMs <= 30_000;

  return (
    <div className={`countdown${isEndingSoon ? " ending-soon" : ""}`}>
      {formatRemaining(remainingMs)}
    </div>
  );
}
