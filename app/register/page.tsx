"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bidderIdentifier, setBidderIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!bidderIdentifier.trim()) {
      setError("Bidder identifier is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      await register(email, password, bidderIdentifier);
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next || "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not register.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="card stack">
      <h1>Register</h1>
      {error && <div className="banner banner-error">{error}</div>}
      <form className="stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="bidderIdentifier">Bidder identifier (public display name)</label>
          <input
            id="bidderIdentifier"
            type="text"
            required
            value={bidderIdentifier}
            onChange={(e) => setBidderIdentifier(e.target.value)}
            placeholder="e.g. alice"
          />
        </div>
        <button className="button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Registering..." : "Register"}
        </button>
      </form>
      <p className="muted">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </div>
  );
}
