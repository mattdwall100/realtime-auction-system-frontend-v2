"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ApiError, createAuction, type CreateAuctionResponse } from "@/lib/api";
import { centsToDisplay, poundsToCents } from "@/lib/money";
import {
  MAX_AUCTION_DURATION_SECONDS,
  MAX_MONEY_CENTS,
  validateItemName,
} from "@/lib/validation";

export default function CreateAuctionForm({
  onCreated,
}: {
  onCreated?: () => void;
}) {
  const [itemName, setItemName] = useState("");
  const [startingPrice, setStartingPrice] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<CreateAuctionResponse | null>(null);

  // UX-only pre-checks; the backend re-validates all of this authoritatively.
  function validate(): string | null {
    const nameError = validateItemName(itemName);
    if (nameError) return nameError;
    const price = Number(startingPrice);
    if (Number.isNaN(price) || price < 0) return "Starting price must be 0 or more.";
    if (poundsToCents(price) > MAX_MONEY_CENTS) {
      return `Starting price cannot exceed ${centsToDisplay(MAX_MONEY_CENTS)}.`;
    }
    const duration = Number(durationSeconds);
    if (!Number.isInteger(duration) || duration <= 0) {
      return "Duration must be a whole number of seconds greater than 0.";
    }
    if (duration > MAX_AUCTION_DURATION_SECONDS) {
      return "Auction duration cannot exceed 7 days (604800 seconds).";
    }
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    setCreated(null);

    const validationError = validate();
    if (validationError) {
      setFieldError(validationError);
      return;
    }
    setFieldError(null);
    setIsSubmitting(true);

    try {
      const response = await createAuction({
        itemName: itemName.trim(),
        startingPriceCents: poundsToCents(Number(startingPrice)),
        durationSeconds: Number(durationSeconds),
      });
      setCreated(response);
      setItemName("");
      setStartingPrice("");
      setDurationSeconds("");
      onCreated?.();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Could not create auction.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h1>Create an auction</h1>
        {fieldError && <div className="banner banner-error">{fieldError}</div>}
        {submitError && <div className="banner banner-error">{submitError}</div>}
        <form className="stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="itemName">Item name</label>
            <input
              id="itemName"
              type="text"
              maxLength={100}
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Vintage Watch"
            />
          </div>
          <div className="field">
            <label htmlFor="startingPrice">Starting price (£)</label>
            <input
              id="startingPrice"
              type="number"
              min="0"
              step="0.01"
              value={startingPrice}
              onChange={(e) => setStartingPrice(e.target.value)}
              placeholder="10.00"
            />
          </div>
          <div className="field">
            <label htmlFor="durationSeconds">Duration (seconds, max 7 days)</label>
            <input
              id="durationSeconds"
              type="number"
              min="1"
              max={MAX_AUCTION_DURATION_SECONDS}
              step="1"
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(e.target.value)}
              placeholder="300"
            />
          </div>
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create auction"}
          </button>
        </form>
      </div>

      {created && (
        <div className="card stack">
          <h2>Auction created</h2>
          <p>
            Auction ID: <strong>{created.id}</strong>
          </p>
          <p>Ends at: {new Date(created.end_time).toLocaleString()}</p>
          <Link className="button" href={`/auctions/${created.id}`}>
            Open auction
          </Link>
        </div>
      )}
    </div>
  );
}
