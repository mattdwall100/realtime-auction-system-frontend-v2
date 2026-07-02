const formatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

export function centsToDisplay(cents: number): string {
  return formatter.format(cents / 100);
}

export function poundsToCents(amount: number): number {
  return Math.round(amount * 100);
}

// Minimum next bid: at least 1% above the current bid, in whole cents.
// Uses integer math (current + ceil(current / 100)) to exactly match the
// backend's place_bid rule and avoid floating-point drift from `current * 1.01`.
export function minNextBidCents(currentCents: number): number {
  return currentCents + Math.ceil(currentCents / 100);
}
