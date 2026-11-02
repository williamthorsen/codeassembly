import { describe, expect, it } from 'vitest';

import { makeStore, seedEvents } from '../../lesson-clusters/test-utils/seed-store.ts';
import { buildReferences, isEligibleReference } from '../references.ts';

const TICKET = 'https://github.com/acme/guide/issues/12';
const PERMALINK = `https://github.com/acme/guide/blob/${'a'.repeat(40)}/rules/headings.md`;
const TRIAGE = '~/ai-artifacts/feedback-triage/20261020-120000Z_triage_feedback-triage.md';

describe(buildReferences, () => {
  it('lists the addressed feedback events with an eligible reference, keeping only those references', async () => {
    const { storePath } = await makeStore();
    await seedEvents(storePath, [
      { id: '01A', addressedBy: [TICKET] },
      { id: '01B', addressedBy: [PERMALINK] },
      { id: '01C', tags: ['feedback', 'deferred'], addressedBy: [TRIAGE] },
      { id: '01D', addressedBy: [PERMALINK, TICKET] },
      { id: '01E', tags: ['feedback', 'obsolete'], addressedBy: [TICKET] },
      { id: '01F', tags: ['observation'], addressedBy: [TICKET] },
      { id: '01G' },
    ]);

    const references = await buildReferences({ storePath });

    expect(references.map((entry) => [entry.id, entry.references])).toStrictEqual([
      ['01A', [TICKET]],
      ['01D', [TICKET]],
    ]);
  });
});

describe(isEligibleReference, () => {
  it('rejects a triage artifact and a covered permalink, and accepts anything else', () => {
    expect(isEligibleReference(TRIAGE)).toBe(false);
    expect(isEligibleReference(PERMALINK)).toBe(false);
    expect(isEligibleReference(TICKET)).toBe(true);
    expect(isEligibleReference('https://github.com/acme/guide/blob/main/rules/headings.md')).toBe(true);
  });
});
