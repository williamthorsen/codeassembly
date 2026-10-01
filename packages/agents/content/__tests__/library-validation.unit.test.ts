import { describe, expect, it } from 'vitest';

import { formatContentDefects } from '../../src/lib/content-defects.ts';
import { resolveContentDir } from '../../src/lib/content-resolver.ts';
import { validateContentRoot } from '../../src/lib/content-validation.ts';
import { ALL_HARNESS_IDS } from '../../src/lib/harness.ts';

// Holds the library to every rule that `codeassembly validate` applies to a producer's root, against every harness.
//
// The run renders the whole library once per harness, which takes longer under parallel-worker load than the tier's
// own budget allows. The ceiling here matches the budget of the tiers above `unit`.
describe('library validation', { timeout: 30_000 }, () => {
  it('reports no defects in the library', async () => {
    const defects = await validateContentRoot(resolveContentDir(), ALL_HARNESS_IDS);

    const message = `codeassembly validate reports defects in the library:\n\n${formatContentDefects(defects)}`;
    expect(defects, message).toEqual([]);
  });
});
