import type { NextConfig } from "next";

// The FastAPI backend the proxy below forwards to. Server-side only (not
// NEXT_PUBLIC_): the browser never sees this URL.
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // All API calls go through the frontend's own origin and are proxied to the
  // backend here. This keeps the HttpOnly auth cookie first-party — the
  // browser sees Set-Cookie as coming from this site — so SameSite=Lax works
  // identically in dev and production, with no cross-site cookie (third-party
  // cookie blocking) or CORS concerns in the browser.
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
