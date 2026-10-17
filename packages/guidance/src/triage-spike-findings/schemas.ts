/** The dispositions record that the skill writes, and the gate that every record must pass before it is rendered. */
import { z } from 'zod';

/** The outcomes of the challenge on one item. */
export const CHALLENGE_OUTCOMES = ['abandoned', 'defended', 'modified'] as const;

/**
 * The confidence grades, which state how advisable an item is; only an item graded `high` or `medium` gets a ticket.
 */
export const CONFIDENCE_GRADES = ['high', 'low', 'medium'] as const;

/** The dispositions that an item can take. */
export const DISPOSITIONS = ['comment', 'drop', 'merge', 'ticket'] as const;

/** The value grades, which state how much an item matters. */
export const VALUE_GRADES = ['must-have', 'nice-to-have', 'questionable', 'should-have'] as const;

const PositiveInteger = z.number().int().positive();

export const ItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  disposition: z.enum(DISPOSITIONS),
  confidence: z.enum(CONFIDENCE_GRADES),
  value: z.enum(VALUE_GRADES),
  reason: z.string().min(1),
  target: z.union([PositiveInteger, z.string().min(1), z.null()]),
  ticket: PositiveInteger.nullable(),
  /** The blockers of a `ticket` item: the ids of other `ticket` items, and the numbers of issues outside the triage. */
  blockedBy: z.array(z.union([PositiveInteger, z.string().min(1)])).optional(),
  challenge: z.object({
    argument: z.string(),
    outcome: z.enum(CHALLENGE_OUTCOMES),
    note: z.string(),
  }),
});

export const RecordSchema = z.object({
  source: z.string().min(1),
  triageTicket: PositiveInteger,
  umbrella: PositiveInteger.nullable(),
  items: z.array(ItemSchema).min(1),
  challengeSummary: z.string(),
  notes: z.array(z.string()),
});

export type ChallengeOutcome = (typeof CHALLENGE_OUTCOMES)[number];
export type ConfidenceGrade = (typeof CONFIDENCE_GRADES)[number];
export type Disposition = (typeof DISPOSITIONS)[number];
export type DispositionsRecord = z.infer<typeof RecordSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type ValueGrade = (typeof VALUE_GRADES)[number];

/** One clause of the gate that an item fails. */
export interface GateViolation {
  clause: string;
  id: string;
}

/**
 * Checks a parsed record against the gate: a `low` item never takes a ticket; a `merge` targets a `ticket` item by id; a
 * `comment` targets an issue number; a `ticket` or `drop` item does not have a target; only a `ticket` item has a
 * ticket number or blockers; a blocker id names another `ticket` item, once; the blockers do not form a cycle; and ids
 * are unique.
 * Returns every violation, so that one run reports them all.
 */
export function checkGate(record: DispositionsRecord): GateViolation[] {
  const violations: GateViolation[] = [];
  const byId = new Map<string, Item>();
  for (const item of record.items) {
    if (byId.has(item.id)) violations.push({ id: item.id, clause: 'the id is declared more than once' });
    byId.set(item.id, item);
  }
  for (const item of record.items) {
    if (item.disposition === 'ticket' && item.confidence === 'low') {
      violations.push({ id: item.id, clause: 'a low item does not take a ticket' });
    }
    if (item.disposition !== 'ticket' && item.ticket !== null) {
      violations.push({ id: item.id, clause: `a ${item.disposition} item does not have a ticket number` });
    }
    switch (item.disposition) {
      case 'comment':
        if (typeof item.target !== 'number') {
          violations.push({ id: item.id, clause: 'a comment names an issue number as its target' });
        }
        break;
      case 'merge': {
        const target = typeof item.target === 'string' ? byId.get(item.target) : undefined;
        if (target === undefined) {
          violations.push({ id: item.id, clause: 'a merge names the id of another item as its target' });
        } else if (target.disposition !== 'ticket') {
          violations.push({
            id: item.id,
            clause: `a merge targets a ticket item, and ${target.id} is a ${target.disposition}`,
          });
        }
        break;
      }
      default:
        if (item.target !== null) {
          violations.push({ id: item.id, clause: `a ${item.disposition} item does not have a target` });
        }
    }
    violations.push(...checkBlockers(item, byId));
  }
  violations.push(...findCycles(record, byId));
  return violations;
}

/**
 * Returns the ids of the `ticket` items without a ticket number, and whether the umbrella is missing. A record without
 * any `ticket` item does not need an umbrella, so its umbrella is never missing.
 */
export function findMissingTickets(record: DispositionsRecord): { items: string[]; umbrella: boolean } {
  return {
    items: record.items.filter((item) => item.disposition === 'ticket' && item.ticket === null).map((item) => item.id),
    umbrella: record.umbrella === null && hasTicketItem(record),
  };
}

/** Returns whether any item of the record takes a ticket, and therefore needs the umbrella. */
export function hasTicketItem(record: DispositionsRecord): boolean {
  return record.items.some((item) => item.disposition === 'ticket');
}

/**
 * Returns the ids of the `ticket` items that block `item` within the record, skipping every entry that fails the gate,
 * so that the ordering and the cycle check see only valid relations.
 */
export function listInternalBlockers(item: Item, byId: ReadonlyMap<string, Item>): string[] {
  if (item.disposition !== 'ticket') return [];
  const blockers = new Set<string>();
  const entries = item.blockedBy ?? [];
  for (const entry of entries) {
    if (typeof entry === 'string' && entry !== item.id && byId.get(entry)?.disposition === 'ticket') {
      blockers.add(entry);
    }
  }
  return [...blockers];
}

// region | Helpers

/** Checks one item's blockers: only a `ticket` item has any, and each id names another `ticket` item, once. */
function checkBlockers(item: Item, byId: ReadonlyMap<string, Item>): GateViolation[] {
  const blockedBy = item.blockedBy ?? [];
  if (blockedBy.length === 0) return [];
  if (item.disposition !== 'ticket') {
    return [{ id: item.id, clause: `a ${item.disposition} item does not have blockers` }];
  }
  const violations: GateViolation[] = [];
  const seen = new Set<number | string>();
  for (const entry of blockedBy) {
    if (seen.has(entry))
      violations.push({ id: item.id, clause: `the blocker ${String(entry)} is listed more than once` });
    seen.add(entry);
    if (typeof entry !== 'string') continue;
    const blocker = byId.get(entry);
    if (entry === item.id) {
      violations.push({ id: item.id, clause: 'an item does not block itself' });
    } else if (blocker === undefined) {
      violations.push({ id: item.id, clause: `the blocker ${entry} is not an item` });
    } else if (blocker.disposition !== 'ticket') {
      violations.push({ id: item.id, clause: `a blocker is a ticket item, and ${entry} is a ${blocker.disposition}` });
    }
  }
  return violations;
}

/** Reports each cycle among the `ticket` items' blockers once, against the item at which the search re-entered it. */
function findCycles(record: DispositionsRecord, byId: ReadonlyMap<string, Item>): GateViolation[] {
  const violations: GateViolation[] = [];
  const done = new Set<string>();
  const path: string[] = [];
  function visit(id: string): void {
    const start = path.indexOf(id);
    if (start !== -1) {
      const cycle = [...path.slice(start), id];
      violations.push({ id, clause: `a blocked-by cycle: ${cycle.join(' → ')}` });
      return;
    }
    if (done.has(id)) return;
    const item = byId.get(id);
    if (item === undefined) return;
    path.push(id);
    for (const blocker of listInternalBlockers(item, byId)) visit(blocker);
    path.pop();
    done.add(id);
  }
  for (const item of record.items) visit(item.id);
  return violations;
}

// endregion | Helpers
