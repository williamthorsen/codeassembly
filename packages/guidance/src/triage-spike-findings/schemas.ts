/** The dispositions record that the skill writes, and the gate that every record must pass before it is rendered. */
import { z } from 'zod';

/** The outcomes of the challenge on one item. */
export const CHALLENGE_OUTCOMES = ['abandoned', 'defended', 'modified'] as const;

/** The confidence grades, which state how advisable an item is; only `high` and `medium` earn a ticket. */
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
 * `comment` targets an issue number; a `ticket` or `drop` item has no target; only a `ticket` item carries a ticket
 * number; and ids are unique. Returns every violation, so that one run reports them all.
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
      violations.push({ id: item.id, clause: `a ${item.disposition} item does not carry a ticket number` });
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
  }
  return violations;
}

/** Returns the ids of the `ticket` items without a ticket number, and whether the umbrella is missing. */
export function findMissingTickets(record: DispositionsRecord): { items: string[]; umbrella: boolean } {
  return {
    items: record.items.filter((item) => item.disposition === 'ticket' && item.ticket === null).map((item) => item.id),
    umbrella: record.umbrella === null,
  };
}
