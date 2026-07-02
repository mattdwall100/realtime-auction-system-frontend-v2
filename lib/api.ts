export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

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

export interface TokenResponse {
  access_token: string;
  token_type: string;
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

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
  notifyOnError = true
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    const message = "Could not reach the server. Check your connection and try again.";
    if (notifyOnError) reportFailure(message);
    throw new ApiError(message, 0);
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

export function registerUser(input: {
  email: string;
  password: string;
  bidderIdentifier: string;
}): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/register", {
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
}): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
}

export function getMe(token: string, notifyOnError = true): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/me", { method: "GET" }, token, notifyOnError);
}

export function createAuction(
  input: { itemName: string; startingPriceCents: number; durationSeconds: number },
  token?: string | null
): Promise<CreateAuctionResponse> {
  return apiFetch<CreateAuctionResponse>(
    "/auctions",
    {
      method: "POST",
      body: JSON.stringify({
        item_name: input.itemName,
        starting_price_cents: input.startingPriceCents,
        duration_seconds: input.durationSeconds,
      }),
    },
    token
  );
}

export function listAuctions(
  status: "active" | "ended" | "all" = "active",
  token?: string | null
): Promise<AuctionSummary[]> {
  return apiFetch<AuctionSummary[]>(
    `/auctions?status=${status}`,
    { method: "GET" },
    token
  );
}

export function listWonAuctions(token: string): Promise<AuctionSummary[]> {
  return apiFetch<AuctionSummary[]>("/auctions/won", { method: "GET" }, token);
}

export function listMyAuctions(token: string): Promise<AuctionSummary[]> {
  return apiFetch<AuctionSummary[]>("/auctions/mine", { method: "GET" }, token);
}

export function getAuction(
  id: string | number,
  token?: string | null
): Promise<AuctionState> {
  return apiFetch<AuctionState>(`/auctions/${id}`, { method: "GET" }, token);
}

export function placeBid(
  id: string | number,
  amountCents: number,
  token: string
): Promise<AuctionState> {
  return apiFetch<AuctionState>(
    `/auctions/${id}/bid`,
    { method: "POST", body: JSON.stringify({ amount_cents: amountCents }) },
    token
  );
}
