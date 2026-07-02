"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Header() {
  const { bidderIdentifier, isReady, logout } = useAuth();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <header className="header">
      <Link href="/" className="header-brand">
        Auction House
      </Link>
      <nav className="header-nav">
        {isReady && bidderIdentifier ? (
          <>
            <span>
              Bidding as <strong>{bidderIdentifier}</strong>
            </span>
            <button type="button" className="link-button" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link href="/login">Log in</Link>
            <Link href="/register">Register</Link>
          </>
        )}
      </nav>
    </header>
  );
}
