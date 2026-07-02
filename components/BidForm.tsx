"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { ApiError, placeBid, type AuctionState } from "@/lib/api";
import { centsToDisplay, minNextBidCents, poundsToCents } from "@/lib/money";

interface BidFormProps {
  auctionId: number;
  currentBidCents: number;
  status: "active" | "ended";
  onBidPlaced: (state: AuctionState) => void;
}

export default function BidForm({
  auctionId,
  currentBidCents,
  status,
  onBidPlaced,
}: BidFormProps) {
  const { token, bidderIdentifier } = useAuth();
  const [amount, setAmount] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEnded = status === "ended";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldError(null);
    setSubmitError(null);
    setSuccessMessage(null);

    if (!token) {
      setSubmitError("You must be logged in to bid.");
      return;
    }

    const value = Number(amount);
    if (Number.isNaN(value) || value <= 0) {
      setFieldError("Enter a valid bid amount.");
      return;
    }
    const amountCents = poundsToCents(value);
    const minBid = minNextBidCents(currentBidCents);
    if (amountCents < minBid) {
      setFieldError(
        `Bid must be at least ${centsToDisplay(minBid)} (1% above the current bid of ${centsToDisplay(
          currentBidCents
        )}).`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const state = await placeBid(auctionId, amountCents, token);
      onBidPlaced(state);
      setSuccessMessage("Bid placed!");
      setAmount("");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Could not place bid.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="card stack">
        <h2>Place a bid</h2>
        <p className="muted">
          You need to be logged in to bid.{" "}
          <Link href={`/login?next=/auctions/${auctionId}`}>Log in</Link> or{" "}
          <Link href={`/register?next=/auctions/${auctionId}`}>register</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="card stack">
      <h2>Place a bid</h2>
      <p className="muted">
        Bidding as <strong>{bidderIdentifier}</strong>
        {!isEnded && ` · minimum bid ${centsToDisplay(minNextBidCents(currentBidCents))}`}
      </p>
      {fieldError && <div className="banner banner-error">{fieldError}</div>}
      {submitError && <div className="banner banner-error">{submitError}</div>}
      {successMessage && <div className="banner banner-success">{successMessage}</div>}
      <form className="inline-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="bidAmount">Your bid (£)</label>
          <input
            id="bidAmount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isEnded || isSubmitting}
          />
        </div>
        <button className="button" type="submit" disabled={isEnded || isSubmitting}>
          {isEnded ? "Auction ended" : isSubmitting ? "Placing..." : "Place bid"}
        </button>
      </form>
    </div>
  );
}
