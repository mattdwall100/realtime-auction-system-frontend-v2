"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { ApiError, placeBid, type AuctionState } from "@/lib/api";
import { centsToDisplay, minNextBidCents, poundsToCents } from "@/lib/money";
import { MAX_MONEY_CENTS } from "@/lib/validation";

interface BidFormProps {
  auctionId: number;
  currentBidCents: number;
  status: "active" | "ended";
  onBidPlaced: (state: AuctionState) => void;
}

// Server responses surface as transient toasts, not in-page banners: business
// rejections ("already the highest bidder") as a yellow warning, other errors
// red, and a successful bid via the "You are the highest bidder" transition
// toast in AuctionView. Only client-side *input* validation stays inline,
// since it belongs next to the field it corrects.
export default function BidForm({
  auctionId,
  currentBidCents,
  status,
  onBidPlaced,
}: BidFormProps) {
  const { isAuthenticated, bidderIdentifier } = useAuth();
  const { notify } = useToast();
  const [amount, setAmount] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEnded = status === "ended";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldError(null);

    const value = Number(amount);
    if (Number.isNaN(value) || value <= 0) {
      setFieldError("Enter a valid bid amount.");
      return;
    }
    const amountCents = poundsToCents(value);
    if (amountCents > MAX_MONEY_CENTS) {
      setFieldError(`Bid cannot exceed ${centsToDisplay(MAX_MONEY_CENTS)}.`);
      return;
    }
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
      const state = await placeBid(auctionId, amountCents);
      onBidPlaced(state);
      setAmount("");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not place bid.";
      // "Already the highest bidder" is a business-rule nudge, not a failure —
      // surface it as a yellow warning toast rather than a red error.
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        /highest bidder/i.test(err.message)
      ) {
        notify(message, "warning");
      } else {
        notify(message, "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isAuthenticated) {
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
