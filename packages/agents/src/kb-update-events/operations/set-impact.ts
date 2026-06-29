import type { EventImpact, KbEvent } from '@codeassembly/kb/records';

/**
 * Replaces an event's impact rating. Impact is a revisable subjective assessment, so this overwrites any prior value and
 * stamps no timestamp — like the other event mutations, it is a curatorial annotation, not a substantive edit.
 */
export function setImpact(record: KbEvent, impact: EventImpact): KbEvent {
  return { ...record, impact };
}
