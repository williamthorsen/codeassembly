import { type ContentDefect, HARNESS_IDS, validateContentRoot } from 'codeassembly/api';
import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';

// Holds the library to every rule that `codeassembly validate` applies to a producer's root, against every harness.
//
// The run renders the whole library once per harness, which takes longer under parallel-worker load than the tier's
// own budget allows. The ceiling here matches the budget of the tiers above `unit`.
describe('library validation', { timeout: 30_000 }, () => {
  it('reports no defects in the library', async () => {
    const defects = await validateContentRoot(CONTENT_ROOT, HARNESS_IDS);

    const message = `codeassembly validate reports defects in the library:\n\n${defects.map(formatDefect).join('\n')}`;
    expect(defects, message).toEqual([]);
  });
});

// region | Helpers

/** Renders one defect as a line of the failure message. */
function formatDefect({ detail, file, kind }: ContentDefect): string {
  return `${file} [${kind}]: ${detail}`;
}

// endregion | Helpers
