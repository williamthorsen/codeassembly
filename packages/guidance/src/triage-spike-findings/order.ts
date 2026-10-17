/** Orders a dispositions record's items for every listing: the tickets by priority and blockers, then the items without one. */
import {
  type ConfidenceGrade,
  type DispositionsRecord,
  type Item,
  listInternalBlockers,
  type ValueGrade,
} from './schemas.ts';

const CONFIDENCE_RANK: readonly ConfidenceGrade[] = ['high', 'medium', 'low'];

const VALUE_RANK: readonly ValueGrade[] = ['must-have', 'should-have', 'nice-to-have', 'questionable'];

/**
 * Returns the items in display order, which is also the creation order: the `ticket` items with every blocker before the
 * items that it blocks, choosing among the items whose blockers are placed by value, then confidence, then record order,
 * each followed by the `merge` items that target it; then the `comment` and `drop` items in record order. Assumes a
 * record that passed the gate, whose blockers do not form a cycle.
 */
export function orderItems(record: DispositionsRecord): Item[] {
  const byId = new Map(record.items.map((item) => [item.id, item]));
  const tickets = record.items.filter((item) => item.disposition === 'ticket');
  const merges = record.items.filter((item) => item.disposition === 'merge');
  const rest = record.items.filter((item) => item.disposition === 'comment' || item.disposition === 'drop');
  return [
    ...sortByBlockers(tickets, byId).flatMap((ticket) => [
      ticket,
      ...merges.filter((merge) => merge.target === ticket.id),
    ]),
    ...rest,
  ];
}

// region | Helpers

/** Compares two items by value, then confidence, then their position in `tickets`. */
function comparePriority(tickets: readonly Item[], a: Item, b: Item): number {
  return (
    compareRank(VALUE_RANK, a.value, b.value) ||
    compareRank(CONFIDENCE_RANK, a.confidence, b.confidence) ||
    tickets.indexOf(a) - tickets.indexOf(b)
  );
}

/** Compares two grades by their position in `rank`. */
function compareRank<T>(rank: readonly T[], a: T, b: T): number {
  return rank.indexOf(a) - rank.indexOf(b);
}

/** Places each ticket item once all of its blockers are placed, taking the highest-priority ready item each time. */
function sortByBlockers(tickets: readonly Item[], byId: ReadonlyMap<string, Item>): Item[] {
  const placed = new Set<string>();
  const remaining = tickets.toSorted((a, b) => comparePriority(tickets, a, b));
  const sorted: Item[] = [];
  while (remaining.length > 0) {
    const readyIndex = remaining.findIndex((item) =>
      listInternalBlockers(item, byId).every((blocker) => placed.has(blocker)),
    );
    // When a cycle leaves every remaining item blocked, place the rest by priority rather than loop.
    const [next] = remaining.splice(Math.max(readyIndex, 0), 1);
    if (next === undefined) break;
    placed.add(next.id);
    sorted.push(next);
  }
  return sorted;
}

// endregion | Helpers
