import type { EventImpact, KbEvent } from '@williamthorsen/kb/records';

/** Replaces an event's impact rating, overwriting any prior value. */
export function setImpact(record: KbEvent, impact: EventImpact): KbEvent {
  return { ...record, impact };
}
