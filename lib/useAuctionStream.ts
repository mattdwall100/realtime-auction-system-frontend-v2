"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL, ApiError, getAuction, type AuctionState } from "./api";

// The server sends a frame at least every 5s (an `update` on change, a `ping`
// heartbeat otherwise). If nothing arrives within the threshold — 1.5× the
// ping interval, so ordinary scheduling jitter doesn't cause reconnect storms
// — the connection is presumed silently dead and is torn down and reopened.
const STALE_THRESHOLD_MS = 7500;
const WATCHDOG_CHECK_MS = 1000;

interface AuctionStream {
  auction: AuctionState | null;
  isLoading: boolean;
  notFound: boolean;
  loadError: string | null;
  /** True while the stream looks dead and a reconnect is in progress. */
  isReconnecting: boolean;
  /** Apply a state received outside the stream (e.g. a bid POST response). */
  applyState: (state: AuctionState) => void;
}

export function useAuctionStream(auctionId: string): AuctionStream {
  const [auction, setAuction] = useState<AuctionState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const applyState = useCallback((state: AuctionState) => setAuction(state), []);

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let watchdog: ReturnType<typeof setInterval> | null = null;
    let lastFrameAt = Date.now();

    function stop() {
      source?.close();
      source = null;
      if (watchdog) {
        clearInterval(watchdog);
        watchdog = null;
      }
    }

    function connect() {
      if (cancelled) return;
      source?.close();
      lastFrameAt = Date.now();
      // EventSource sends the HttpOnly auth cookie automatically (same-origin
      // via the proxy), so the server can include the per-viewer block.
      source = new EventSource(`${API_BASE_URL}/auctions/${auctionId}/stream`);

      source.addEventListener("update", (event) => {
        if (cancelled) return;
        lastFrameAt = Date.now();
        setIsReconnecting(false);
        const state = JSON.parse((event as MessageEvent).data) as AuctionState;
        setAuction(state);
        // An ended auction is final — the server closes the stream, and
        // without this close EventSource would reconnect in a loop.
        if (state.status === "ended") stop();
      });

      // Heartbeat: only feeds the watchdog.
      source.addEventListener("ping", () => {
        lastFrameAt = Date.now();
        setIsReconnecting(false);
      });

      source.onerror = () => {
        if (cancelled) return;
        // EventSource retries dropped connections natively; reset the clock so
        // the watchdog doesn't force a second reconnect mid-retry. The
        // watchdog remains the backstop for connections that die *silently*
        // (no error event, just no frames).
        lastFrameAt = Date.now();
        setIsReconnecting(true);
      };
    }

    async function init() {
      // Initial paint (and 404/offline detection) via the plain JSON endpoint;
      // the stream's first event is a harmless duplicate of this state.
      try {
        const state = await getAuction(auctionId);
        if (cancelled) return;
        setAuction(state);
        setIsLoading(false);
        if (state.status === "ended") return; // nothing further will change
      } catch (err) {
        if (cancelled) return;
        setIsLoading(false);
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setLoadError(
            err instanceof ApiError ? err.message : "Could not reach the server."
          );
        }
        return;
      }

      connect();
      watchdog = setInterval(() => {
        if (Date.now() - lastFrameAt > STALE_THRESHOLD_MS) {
          setIsReconnecting(true);
          connect(); // force a fresh connection; resets lastFrameAt
        }
      }, WATCHDOG_CHECK_MS);
    }

    init();
    return () => {
      cancelled = true;
      stop();
    };
  }, [auctionId]);

  return { auction, isLoading, notFound, loadError, isReconnecting, applyState };
}
