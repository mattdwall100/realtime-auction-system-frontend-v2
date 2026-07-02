# Real-time Auction System — Frontend

Next.js (App Router, TypeScript) frontend for the auction system. It talks to a separately
hosted FastAPI backend over REST — see `../backend`.

## Setup

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`. Backend is expected at `http://127.0.0.1:8000`
unless `NEXT_PUBLIC_API_BASE_URL` is set.

```bash
cp .env.local.example .env.local
# edit .env.local if your backend isn't at the default local URL
```

## Pages

- `/` — **Authenticated home.** Unauthenticated visitors are redirected to `/login`. Once
  logged in it shows the Create Auction form (submits `POST /auctions`, then displays the new
  auction's ID, end time, and a link to its live view) and, below it, a live-updating list of
  all currently active auctions (`GET /auctions?status=active`, polled every 3s) with a "Join"
  link into each one.
- `/auctions/[id]` — Live Auction view. Polls `GET /auctions/:id` every second, shows the
  current bid, high bidder, a server-synchronized countdown, bid history, an outbid banner,
  and a winner announcement once the auction ends.
- `/login`, `/register` — the backend requires an authenticated JWT to place a bid (identity
  is derived server-side, never trusted from the client). These pages call the backend's
  `/auth/login` and `/auth/register` endpoints, store the returned token in `localStorage`,
  and redirect back to the home page (or the `?next=` route) on success.

## Backend URL / deployment

The frontend is meant to be deployed independently (e.g. on Vercel) from the FastAPI backend.
All API calls go through `lib/api.ts`, which reads:

```ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
```

No component hard-codes a backend URL.

**On Vercel**, set the environment variable:

```
NEXT_PUBLIC_API_BASE_URL=<your deployed backend URL>
```

Tradeoff: the frontend is statically deployable on Vercel and communicates with a separately
hosted FastAPI backend through `NEXT_PUBLIC_API_BASE_URL`, keeping frontend and backend
deployments cleanly separated.

## CORS

Not solved on the frontend. The backend must allow requests from `http://localhost:3000` in
development and from the deployed Vercel domain in production (already configured broadly in
this backend's `CORSMiddleware`; tighten `allow_origins` to those specific domains before
shipping to production).

## Real-time approach: polling, not push

The backend only exposes REST endpoints (no WebSocket), so "real-time" here means
`GET /auctions/:id` polled every 1 second while a viewer is on the auction page. Bid updates,
outbid detection, and the ended/winner transition are all just the result of the next poll
picking up a changed row.

**Chosen:**
- REST-only frontend using polling every 1 second for live auction state.

**Tradeoffs:**
- Simple and reliable to build under time pressure, using only the specified endpoints.
- Not true server push — updates can lag by up to ~1s.
- The countdown is visually synchronized using `server_time` from each response
  (`serverOffsetMs = Date.parse(server_time) - Date.now()`), but the backend's `status` field
  remains the authoritative source of truth for whether the auction has actually ended —
  the UI never marks an auction "ended" from the local countdown alone, it waits for the next
  poll to confirm.
- In production, this should be replaced or supplemented with WebSockets/SSE for real bid
  broadcasts, targeted outbid pushes, and auction-ended events.

## Outbid detection

This backend's `GET /auctions/:id` returns a `viewer` block (`is_high_bidder`, `has_bid`,
`has_been_outbid`, `is_winner`) computed server-side whenever a valid bearer token is attached
to the request — the frontend attaches the logged-in user's token on every poll, so outbid
state is read directly from `auction.viewer.has_been_outbid` rather than diffed client-side
from two consecutive polls. This is more reliable than a pure client-side heuristic, but it's
still only as fresh as the last poll (up to ~1s old).

## Auth flow (why it exists here)

The original brief for this exercise said "no auth" and assumed bids would carry a
free-text `bidder_identifier`. The backend was later changed to require a real account: two
anonymous clients could otherwise both claim to be "alice". So:

- The home page (`/`) is client-side auth-gated: `HomeView` waits for the auth state to load
  from `localStorage`, then redirects to `/login` if there's no token. Creating an auction
  therefore always happens as a logged-in user (the backend still *accepts* anonymous creation,
  but the UI never exercises that path).
- `POST /auctions/:id/bid` **requires** a bearer token — the bid form shows a "log in to bid"
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

- Replace polling with Supabase Realtime or a WebSocket/SSE layer for true push updates and
  to cut request volume for popular auctions.
- Add a "my auctions" / "my bids" view now that accounts exist.
- Add optimistic UI for bid submission (show the pending bid immediately, reconcile on the
  next poll) instead of waiting for the round-trip.
- Add basic component tests (bid validation, countdown math, outbid banner logic).
- Handle expired/invalid tokens more gracefully (currently a stale token just causes 401s on
  bid attempts; should detect this and prompt re-login automatically).
