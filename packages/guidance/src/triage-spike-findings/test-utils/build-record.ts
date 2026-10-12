import type { DispositionsRecord, Item } from '../schemas.ts';

/** Builds a valid item that takes a ticket at medium confidence, overridden by `overrides`. */
export function buildItem(overrides: Partial<Item> = {}): Item {
  return {
    id: '10',
    title: 'Header search ranking',
    disposition: 'ticket',
    confidence: 'medium',
    value: 'should-have',
    reason: 'The one cross-page path to a book cannot find a shared title.',
    target: null,
    ticket: null,
    challenge: { argument: 'The search already ranks by title.', outcome: 'defended', note: 'Authors still collide.' },
    ...overrides,
  };
}

/** Builds a valid record with one item per disposition, before any ticket exists, overridden by `overrides`. */
export function buildRecord(overrides: Partial<DispositionsRecord> = {}): DispositionsRecord {
  return {
    source: 'spike #270',
    triageTicket: 278,
    umbrella: null,
    items: [
      buildItem(),
      buildItem({
        id: '24',
        title: 'Sign-in error pattern',
        disposition: 'comment',
        target: 272,
        value: 'nice-to-have',
      }),
      buildItem({
        id: '27',
        title: 'Collection handle rule',
        disposition: 'merge',
        target: '10',
        value: 'nice-to-have',
      }),
      buildItem({ id: '16', title: 'Status as a word', disposition: 'drop', confidence: 'low', value: 'questionable' }),
    ],
    challengeSummary: 'A subagent without session context argued against every recommendation.',
    notes: [],
    ...overrides,
  };
}
