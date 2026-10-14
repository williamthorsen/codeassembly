/** Orders a dispositions record's items for every listing: the tickets by priority, then the items without one. */
import type { ConfidenceGrade, DispositionsRecord, Item, ValueGrade } from './schemas.ts';

const CONFIDENCE_RANK: readonly ConfidenceGrade[] = ['high', 'medium', 'low'];

const VALUE_RANK: readonly ValueGrade[] = ['must-have', 'should-have', 'nice-to-have', 'questionable'];

/**
 * Returns the items in display order: the `ticket` items by value, then confidence, with record order breaking ties,
 * each followed by the `merge` items that target it; then the `comment` and `drop` items in record order.
 */
export function orderItems(record: DispositionsRecord): Item[] {
  const tickets = record.items
    .filter((item) => item.disposition === 'ticket')
    .toSorted(
      (a, b) => compareRank(VALUE_RANK, a.value, b.value) || compareRank(CONFIDENCE_RANK, a.confidence, b.confidence),
    );
  const merges = record.items.filter((item) => item.disposition === 'merge');
  const rest = record.items.filter((item) => item.disposition === 'comment' || item.disposition === 'drop');
  return [...tickets.flatMap((ticket) => [ticket, ...merges.filter((merge) => merge.target === ticket.id)]), ...rest];
}

// region | Helpers

/** Compares two grades by their position in `rank`. */
function compareRank<T>(rank: readonly T[], a: T, b: T): number {
  return rank.indexOf(a) - rank.indexOf(b);
}

// endregion | Helpers
