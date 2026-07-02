"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { ApiError, createAuction, type CreateAuctionResponse } from "@/lib/api";
import { poundsToCents } from "@/lib/money";

export default function CreateAuctionForm({
  onCreated,
}: {
  onCreated?: () => void;
}) {
  const { token } = useAuth();

  const [itemName, setItemName] = useState("");
  const [startingPrice, setStartingPrice] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<CreateAuctionResponse | null>(null);

  function validate(): string | null {
    if (!itemName.trim()) return "Item name is required.";
    const price = Number(startingPrice);
    if (Number.isNaN(price) || price < 0) return "Starting price must be 0 or more.";
    const duration = Number(durationSeconds);
    if (!Number.isInteger(duration) || duration <= 0) {
      return "Duration must be a whole number of seconds greater than 0.";
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
      const response = await createAuction(
        {
          itemName: itemName.trim(),
          startingPriceCents: poundsToCents(Number(startingPrice)),
          durationSeconds: Number(durationSeconds),
        },
        token
      );
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
            <label htmlFor="durationSeconds">Duration (seconds)</label>
            <input
              id="durationSeconds"
              type="number"
              min="1"
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
