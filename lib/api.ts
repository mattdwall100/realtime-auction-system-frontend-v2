// All API calls go through the Next.js rewrite proxy (see next.config.ts), so
// requests are same-origin and the HttpOnly auth cookie is attached by the
// browser automatically — no token ever passes through frontend JavaScript.
export const API_BASE_URL = "/api/backend";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type NotifyType = "error" | "success" | "info" | "warning";
type ApiNotifier = (message: string, type: NotifyType) => void;

// The ToastProvider registers a notifier here on mount so that *every* failed
// request — including silent background polls — surfaces a notification, without
// each call site having to remember to show one.
let apiNotifier: ApiNotifier | null = null;

export function setApiNotifier(fn: ApiNotifier | null): void {
  apiNotifier = fn;
}

function reportFailure(message: string): void {
  apiNotifier?.(message, "error");
}

export interface BidRecord {
  id: number;
  internal_user_id: number;
  bidder_identifier: string;
  amount_cents: number;
  created_at: string;
}

export interface Viewer {
  internal_user_id: number;
  bidder_identifier: string;
  is_high_bidder: boolean;
  has_bid: boolean;
  has_been_outbid: boolean;
  is_winner: boolean;
}

export interface AuctionState {
  id: number;
  item_name: string;
  starting_price_cents: number;
  current_bid_cents: number;
  high_bidder_user_id: number | null;
  high_bidder_identifier: string | null;
  created_by_user_id: number | null;
  created_by_identifier: string | null;
  created_at: string;
  end_time: string;
  server_time: string;
  status: "active" | "ended";
  bid_history: BidRecord[];
  viewer: Viewer | null;
}

export interface AuctionSummary {
  id: number;
  item_name: string;
  current_bid_cents: number;
  high_bidder_identifier: string | null;
  created_at: string;
  end_time: string;
  server_time: string;
  status: "active" | "ended";
}

export interface CreateAuctionResponse {
  id: number;
  end_time: string;
  server_time: string;
}

export interface MeResponse {
  external_user_id: string;
  internal_user_id: number;
  email: string;
  bidder_identifier: string;
}

function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) =>
          item && typeof item === "object" && "msg" in item
            ? String((item as { msg: unknown }).msg)
            : String(item)
        )
        .join("; ");
    }
  }
  return `Request failed with status ${status}`;
}

// Endpoints where a 401 is a final answer, not an expired access token:
// refreshing can't help a wrong password, and refreshing in response to
// /auth/refresh itself would recurse.
const NO_REFRESH_PATHS = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

// Single-flight refresh: when several requests (e.g. the 1s auction poll plus
// a bid) hit 401 at the same moment, they must share ONE refresh call —
// Supabase rotates the refresh token on each use, so a second concurrent
// refresh would present the already-consumed token and kill the session.
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        return response.ok;
      } catch {
        return false;
      }
    })();
    // Reset after settling so a later expiry can refresh again; awaiters of
    // the current cycle already hold their promise reference.
    refreshInFlight.finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  notifyOnError = true,
  allowRefreshRetry = true
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      // Send the auth cookies on every request. Requests are same-origin via
      // the proxy, but "include" makes the intent explicit.
      credentials: "include",
    });
  } catch {
    const message = "Could not reach the server. Check your connection and try again.";
    if (notifyOnError) reportFailure(message);
    throw new ApiError(message, 0);
  }

  // On 401 the access token has likely expired: refresh the session (the new
  // cookie is set by the server) and retry the original request exactly once.
  // Only if the refresh itself fails does the 401 surface to the caller.
  if (
    response.status === 401 &&
    allowRefreshRetry &&
    !NO_REFRESH_PATHS.some((p) => path.startsWith(p))
  ) {
    if (await refreshSession()) {
      return apiFetch<T>(path, options, notifyOnError, false);
    }
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const message = extractErrorMessage(body, response.status);
    if (notifyOnError) reportFailure(message);
    throw new ApiError(message, response.status);
  }

  return body as T;
}

// Login/register responses carry no token — the backend sets it as an HttpOnly
// cookie — so they return the user profile directly.
export function registerUser(input: {
  email: string;
  password: string;
  bidderIdentifier: string;
}): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      bidder_identifier: input.bidderIdentifier,
    }),
  });
}

export function loginUser(input: {
  email: string;
  password: string;
}): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
}

export function logoutUser(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" });
}

export function getMe(notifyOnError = true): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/me", { method: "GET" }, notifyOnError);
}

export function createAuction(input: {
  itemName: string;
  startingPriceCents: number;
  durationSeconds: number;
}): Promise<CreateAuctionResponse> {
  return apiFetch<CreateAuctionResponse>("/auctions", {
    method: "POST",
    body: JSON.stringify({
      item_name: input.itemName,
      starting_price_cents: input.startingPriceCents,
      duration_seconds: input.durationSeconds,
    }),
  });
}

export function listAuctions(
  status: "active" | "ended" | "all" = "active"
): Promise<AuctionSummary[]> {
  return apiFetch<AuctionSummary[]>(`/auctions?status=${status}`, {
    method: "GET",
  });
}

export function listWonAuctions(): Promise<AuctionSummary[]> {
  return apiFetch<AuctionSummary[]>("/auctions/won", { method: "GET" });
}

export function listMyAuctions(): Promise<AuctionSummary[]> {
  return apiFetch<AuctionSummary[]>("/auctions/mine", { method: "GET" });
}

export function getAuction(id: string | number): Promise<AuctionState> {
  return apiFetch<AuctionState>(`/auctions/${id}`, { method: "GET" });
}

// notifyOnError is off: BidForm decides the toast type itself (e.g. a yellow
// warning for "already the highest bidder" instead of the generic red error).
export function placeBid(
  id: string | number,
  amountCents: number
): Promise<AuctionState> {
  return apiFetch<AuctionState>(
    `/auctions/${id}/bid`,
    { method: "POST", body: JSON.stringify({ amount_cents: amountCents }) },
    false
  );
}
