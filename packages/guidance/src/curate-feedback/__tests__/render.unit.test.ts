import { describe, expect, it } from 'vitest';

import { renderArtifact } from '../render.ts';
import type { CurationRecord } from '../schemas.ts';

describe(renderArtifact, () => {
  it('opens with one count line per bin, states each mark with its result, and shows each covered quote', () => {
    const record: CurationRecord = {
      store: 'fixture',
      pins: [],
      events: [
        {
          id: '01A',
          summary: 'A | pipe',
          bin: 'duplicate',
          duplicateOf: '01Z',
          reason: 'Same.',
          file: '/w/bins-01.json',
        },
        { id: '01B', summary: 'B', bin: 'obsolete', reason: 'Gone.', file: '/w/bins-01.json' },
        {
          id: '01C',
          summary: 'C',
          bin: 'covered',
          quote: 'Headings use\nsentence case.',
          reason: 'States it.',
          reference: 'https://example.test/c',
          file: '/w/bins-01.json',
        },
      ],
      counts: { covered: 1, duplicate: 1, obsolete: 1, kept: 0 },
      marks: {
        addressedBy: [{ references: ['https://example.test/1'], eventIds: ['01A'], result: { ok: true, failed: [] } }],
        obsolete: { eventIds: ['01B'], result: { ok: false, failed: ['01B'] } },
      },
    };

    const body = renderArtifact(record);

    expect(body).toContain('- covered: 1\n- duplicate: 1\n- obsolete: 1\n- kept: 0');
    expect(body).toContain('- addressed-by <https://example.test/1>: 1 event (applied)');
    expect(body).toContain('- tag `obsolete`: 1 event (failed for 01B)');
    expect(body).toContain(String.raw`| 01A | A \| pipe | duplicate | duplicate of 01Z | Same. |  |`);
    expect(body).toContain('| 01C | C | covered | https://example.test/c | States it. | Headings use sentence case. |');
  });
});
