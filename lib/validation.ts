// Client-side validation for immediate UX feedback only. The backend
// (backend/app/schemas.py and the auctions/auth routers) enforces the same
// rules authoritatively — these constants mirror those values and must be
// kept in sync with them.

export const BIDDER_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;
export const MAX_ITEM_NAME_LENGTH = 100;
// £10m in cents — upper bound on any monetary amount.
export const MAX_MONEY_CENTS = 1_000_000_000;
export const MAX_AUCTION_DURATION_SECONDS = 7 * 24 * 60 * 60;

// Deliberately loose (something@something.tld): real validation happens
// server-side with a proper email validator; this only catches obvious typos
// without rejecting valid-but-unusual addresses.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  if (!EMAIL_SHAPE.test(value.trim())) {
    return "Enter a valid email address.";
  }
  return null;
}

export function validateNewPassword(value: string): string | null {
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function validateBidderIdentifier(value: string): string | null {
  if (!BIDDER_IDENTIFIER_PATTERN.test(value.trim())) {
    return "Bidder identifier must be 3-32 characters using only letters, numbers, underscores, and hyphens.";
  }
  return null;
}

export function validateItemName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Item name is required.";
  if (trimmed.length > MAX_ITEM_NAME_LENGTH) {
    return `Item name must be at most ${MAX_ITEM_NAME_LENGTH} characters.`;
  }
  return null;
}
