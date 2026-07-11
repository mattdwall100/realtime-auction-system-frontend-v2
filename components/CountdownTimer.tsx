"use client";

import { useEffect, useState } from "react";
import { formatRemaining } from "@/lib/time";

interface CountdownTimerProps {
  endTime: string;
  serverOffsetMs: number;
  status: "active" | "ended";
}

// Timer strategy: the countdown ticks smoothly on the client clock. Remaining
// time is (endTime − (now + serverOffsetMs)); both inputs are deliberately
// stable between polls — `endTime` only changes when the server actually
// moves it (an anti-snipe extension), and `serverOffsetMs` is only rebased by
// the parent when the estimated drift exceeds a threshold (see lib/time.ts),
// not on every poll's noisy latency estimate. So the interval below almost
// never restarts and the display never visibly jumps. The server stays the
// source of truth for the auction actually ending: `status` comes from
// polling, and the UI never declares an auction over from the local countdown
// reaching zero.
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
    // 250ms keeps the displayed second flipping close to the true boundary
    // (a 1s interval can lag a full second) while staying cheap.
    const interval = setInterval(tick, 250);
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
