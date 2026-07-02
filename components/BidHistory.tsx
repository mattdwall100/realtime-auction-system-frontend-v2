import type { BidRecord } from "@/lib/api";
import { centsToDisplay } from "@/lib/money";
import { formatTimestamp } from "@/lib/time";

export default function BidHistory({ bids }: { bids: BidRecord[] }) {
  if (bids.length === 0) {
    return <p className="muted">No bids yet.</p>;
  }

  return (
    <ul className="bid-history">
      {bids.map((bid) => (
        <li key={bid.id}>
          <span>{bid.bidder_identifier}</span>
          <span>{centsToDisplay(bid.amount_cents)}</span>
          <span className="bid-meta">{formatTimestamp(bid.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}
