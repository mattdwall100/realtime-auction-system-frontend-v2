# Real-time Auction System — Frontend

> **🟢 Live and ready to use: <https://realtime-auction-system-frontend-v2.vercel.app>**
> Hosted on Vercel; browse live auctions without an account, register to create and bid.

Next.js (App Router, TypeScript) frontend for the auction system. It talks to a separately
hosted FastAPI backend over REST — see `../backend`.

## Setup

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`. Backend is expected at `http://127.0.0.1:8000`
unless `BACKEND_URL` is set in `.env.local`:

```bash
# .env.local — only needed if your backend isn't at the default local URL
BACKEND_URL=http://127.0.0.1:8000
```

## Pages

- `/` — **Public home.** The live-auctions list (`GET /auctions?status=active`) needs no auth,
  so anyone can browse it; unauthenticated visitors see the list plus a log-in/register prompt
  (bidding is gated on the auction page itself). Logged-in users additionally get the Create
  Auction form, "Your auctions", and "Your winning bids". The list is **not polled** — it's
  fetched on page load and refetched after creating an auction; anything newer arrives on a
  page refresh.
- `/auctions/[id]` — Live Auction view. Polls `GET /auctions/:id` every second, shows the
  current bid, high bidder, a server-synchronized countdown, bid history, an outbid banner,
  and a winner announcement once the auction ends.
- `/login`, `/register` — the backend requires an authenticated JWT to place a bid (identity
  is derived server-side, never trusted from the client). These pages call the backend's
  `/auth/login` and `/auth/register` endpoints; the session token arrives as an HttpOnly
  cookie set by the server (never stored in `localStorage`), and the page redirects back to
  the home page (or the `?next=` route) on success.

## Backend URL / deployment

The frontend is deployed independently (e.g. on Vercel) from the FastAPI backend, but the
browser never calls the backend directly: all API calls go to `/api/backend/*` on the
frontend's own origin, and a rewrite in `next.config.ts` proxies them to the backend:

```ts
// next.config.ts
{ source: "/api/backend/:path*", destination: `${BACKEND_URL}/:path*` }
```

This keeps the HttpOnly auth cookie **first-party** (see "Auth token storage" below), so it
works identically in dev and production without cross-site cookie or CORS complications.

**On Vercel**, set the environment variable:

```
BACKEND_URL=<your deployed backend URL>
```

(`BACKEND_URL` is server-side only — it is never exposed to the browser.)

## Auth token storage

Access tokens are **not** stored in `localStorage`/`sessionStorage` or anywhere else readable
by JavaScript. On login/register the backend sets two `HttpOnly; SameSite=Lax` cookies (plus
`Secure` in production): the access token (1h) and the refresh token (30 days, rotated on
use); the browser attaches them automatically on every API call (`credentials: "include"` in
`lib/api.ts`). Because requests are proxied through the frontend's origin, the cookies are
always first-party. Auth state is resolved by asking the server (`GET /auth/me`) rather than
reading a stored token, and logout is a `POST /auth/logout` that clears both cookies
server-side.

**Automatic refresh on 401**: when any request returns 401, the fetch wrapper in `lib/api.ts`
calls `POST /auth/refresh` (the backend exchanges the refresh-token cookie for a new session
via the Supabase Auth SDK and re-issues both cookies) and retries the original request exactly
once. Only if the refresh itself fails — no refresh cookie, or the token was revoked — does
the 401 surface to the caller/user as before. Concurrent 401s (e.g. the 1s poll plus a bid)
share a single in-flight refresh, because Supabase rotates refresh tokens on each use and a
second parallel refresh would consume a stale token and kill the session. Auth endpoints
(`/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`) are exempt — a 401 there
is a final answer, not an expired token.

## CORS

Effectively bypassed in the browser: API requests are same-origin (proxied via the rewrite
above). The backend still restricts credentialed CORS to explicit origins via its
`ALLOWED_ORIGINS` env var for any direct cross-origin access.

## Real-time approach: SSE push with heartbeat watchdog

The auction detail view no longer polls. `lib/useAuctionStream.ts` does an initial
`GET /auctions/:id` fetch (first paint, 404 detection), then opens an `EventSource` on
`GET /auctions/:id/stream`:

- **`update` events** carry the full auction state (same JSON as the GET endpoint) and are
  pushed whenever the auction changes in the database — the backend listens to Supabase
  Realtime (postgres_changes), so a bid placed on any instance reaches every viewer without
  polling. Each update renders immediately: price, bid history, outbid banner, winner state.
- **`ping` events** arrive every 5 s of idle as a heartbeat. A watchdog records the time of the
  last frame (update or ping); if more than 7.5 s pass without one (1.5× the ping interval, so
  ordinary jitter doesn't cause reconnect storms), the connection is presumed silently dead —
  it is closed and a fresh `EventSource` is opened automatically, with a "reconnecting" banner
  shown until frames resume. `EventSource`'s native retry still handles *detectable* drops;
  the watchdog exists for the undetectable ones.
- The server sends the final state and closes the stream once the auction ends; the client
  then stops reconnecting (an ended auction is immutable).
- The EventSource rides the same-origin proxy, so the HttpOnly auth cookie is attached
  automatically and the per-viewer `viewer` block works exactly as before.
- The bid form still applies the `POST /auctions/:id/bid` response state directly — the
  subsequent stream update is a harmless confirmation.
- The home-page auction *list* does not poll: it fetches on page load and after a form
  submission (creating an auction), and otherwise updates on page refresh. Only the detail
  view is live.

**Countdown unchanged:** it ticks on the client clock, synchronized via an estimated clock
offset that is only rebased when a new estimate drifts more than 0.5 s
(`lib/time.ts: shouldRebaseOffset`), and the timer only resets when the server actually moves
`end_time` (anti-snipe extension). The backend's `status` field remains the authoritative
source of truth for whether the auction has ended — never the local countdown reaching zero.

## Outbid detection

The backend returns a `viewer` block (`is_high_bidder`, `has_bid`, `has_been_outbid`,
`is_winner`) computed server-side whenever a valid session is attached to the request — the
browser sends the auth cookie on the stream request automatically, so outbid state is read
directly from `auction.viewer.has_been_outbid` in each pushed update rather than diffed
client-side. Being push-based, it is now as fresh as the event that caused it.

Bid-status messages are **transient toasts, not persistent banners**: AuctionView watches the
viewer flags across updates and fires a toast on *transitions* — "You've been outbid!"
(yellow) when `has_been_outbid` flips on, "You are the highest bidder" (green) when
`is_high_bidder` flips on — so each fires once per change rather than sitting on the page.
Bid submission errors ("You can't bid on your own item", "You are already the highest
bidder.") are toasts too; only client-side input validation stays inline next to the field.

## Auth flow (why it exists here)

The original brief for this exercise said "no auth" and assumed bids would carry a
free-text `bidder_identifier`. The backend was later changed to require a real account: two
anonymous clients could otherwise both claim to be "alice". So:

- The home page (`/`) is public: the live-auctions list requires no auth, so `HomeView` shows
  it to everyone and only reveals the create form and personal lists once the auth state
  (`GET /auth/me` against the session cookie) resolves to a logged-in user.
- `POST /auctions/:id/bid` **requires** an authenticated session — the bid form shows a "log in to bid"
  prompt instead of a bidder-identifier text field when the viewer isn't authenticated.
- The bidder identifier is chosen once at registration and is otherwise never typed into a
  request body — it's resolved server-side from the token and only used for display.

## Backend endpoint note

The original brief listed only three endpoints (`POST /auctions`, `GET /auctions/:id`,
`POST /auctions/:id/bid`). The "list all live auctions on the home page" feature is impossible
with just those — there's no way to enumerate auctions you don't already have the ID for — so
a minimal read-only `GET /auctions?status=active` endpoint was added to the backend. It returns
a lightweight summary per auction (id, item name, current bid, resolved high-bidder identifier,
end time, status) and is what `AuctionList` polls.

## Money formatting

All amounts are sent to/from the API as integer cents (`starting_price_cents`,
`amount_cents`, `current_bid_cents`) to avoid floating-point rounding issues. The UI accepts
and displays pounds (`lib/money.ts`: `poundsToCents` / `centsToDisplay`), converting at the
form boundary only.

## Error notifications

Failed HTTP requests surface a global toast notification (bottom-right), in addition to any
contextual inline message. This is wired centrally: `lib/api.ts` calls a registered notifier
on *every* failed request (network error, 4xx, or 5xx), and `lib/toast.tsx`'s `ToastProvider`
registers that notifier and renders the toasts. Because it's central, even silent background
polls (the auction detail poll, the live-auctions list poll) raise a visible notification when
they fail — previously those failed invisibly. Recurring identical failures (e.g. a poll
hitting a down server every second) are de-duplicated into a single toast whose dismiss timer
is refreshed, so they don't stack up. Toasts auto-dismiss after a few seconds or on clicking ×.

## Assumptions & tradeoffs

- Client-side validation (required fields, bid > current bid, price >= 0, duration > 0) is
  for UX only — the backend remains the source of truth and its error messages are surfaced
  verbatim on rejection.
- Failure feedback is intentionally shown in two places: a transient global toast (so no
  failure is silent) plus, where it existed already, a persistent inline message next to the
  relevant form/section. The toast is the catch-all; the inline text gives local context.
- Polling continues until the backend reports `status: "ended"`, not until the local countdown
  hits zero, so a slow network or clock drift can't cause a premature "ended" state.
- No component/page is statically generated with auction data — everything auction-related is
  a Client Component fetching after mount, since the data is inherently live.
- Kept to plain CSS (`app/globals.css`) rather than pulling in Tailwind, since nothing was
  already installed in this fresh project.

## What I'd improve with more time

- Extend the SSE push model to the home-page auction list (currently fetch-on-demand).
- Add a "my auctions" / "my bids" view now that accounts exist.
- Add optimistic UI for bid submission (show the pending bid immediately, reconcile on the
  next poll) instead of waiting for the round-trip.
- Add basic component tests (bid validation, countdown math, outbid banner logic).
- Proactively refresh shortly before the access token expires (currently refresh is reactive,
  triggered by the first 401), and prompt re-login in place when a session fully dies instead
  of surfacing the failed request's error.
