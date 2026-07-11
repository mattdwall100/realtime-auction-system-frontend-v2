export function computeServerOffsetMs(serverTimeIso: string): number {
  return new Date(serverTimeIso).getTime() - Date.now();
}

// Countdown stability: every poll response yields a slightly different
// server/client offset estimate because network latency varies per request.
// Rebasing the visible countdown on each of those estimates makes it jitter
// (jump forwards/backwards by tens of milliseconds every second). Instead the
// countdown keeps ticking on the client clock and we only rebase when the new
// estimate disagrees with the current one by more than this threshold — i.e.
// when there is genuine clock drift rather than network noise.
export const OFFSET_REBASE_THRESHOLD_MS = 500;

export function shouldRebaseOffset(
  currentOffsetMs: number | null,
  nextOffsetMs: number
): boolean {
  return (
    currentOffsetMs === null ||
    Math.abs(nextOffsetMs - currentOffsetMs) > OFFSET_REBASE_THRESHOLD_MS
  );
}

export function formatRemaining(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
