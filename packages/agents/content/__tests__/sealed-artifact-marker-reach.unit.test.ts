import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';

// Every saved artifact carries the seal marker, which puts the prohibition in the file an agent has open rather than
// only in the standing guidance it may not have loaded. `resolve-frontmatter.sh` emits it for the callers that prepend
// its YAML output; the carriers below write their own frontmatter or their own template, so each inlines the partial.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** The marker's source of truth; every other statement of it must match this one byte for byte. */
const PARTIAL = '_partials/seal-marker.md';

/** The shell constant the script emits, which must not drift from the partial. */
const SCRIPT = 'scripts/resolve-frontmatter.sh';

/** Identifies a marker line wherever it appears, so a drifted copy is found rather than missed. */
const MARKER_KEY = 'Sealed record';

// Listed explicitly rather than discovered: the failure guarded against is a carrier dropping off the list, and a
// discovered list would move with the bug.
//
// A carrier is a site that composes an artifact's opening itself. The first three compose frontmatter without
// prepending the script's YAML output; the last three write artifacts that carry no frontmatter at all, so for them
// the marker opens the file. Every other artifact-writing skill and subagent gets the marker from the script.
const CARRIERS: ReadonlyArray<string> = [
  'skills/create-bitbucket-pr/SKILL.md',
  'skills/create-gh-pr/SKILL.md',
  'skills/merge-gh-pr/SKILL.md',
  'skills/refine-plan/SKILL.md',
  'skills/wrap-up/SKILL.md',
  'subagents/savings-analyzer.md',
];

describe('sealed-artifact marker reach', () => {
  describe.each(CARRIERS)('%s', (relativePath) => {
    it('carries the marker, and every copy of it matches the partial', async () => {
      const marker = await readMarker();
      const expanded = await expandIncludes(path.join(CONTENT_ROOT, relativePath), CONTENT_ROOT);
      const lines = expanded.split('\n').filter((line) => line.includes(MARKER_KEY));

      expect(lines.length, `${relativePath} states no seal marker`).toBeGreaterThanOrEqual(1);

      // A carrier may state the marker more than once: `refine-plan` inlines it from the partial and shows it again
      // inside two example outputs, which sit in list items where an include directive cannot be placed.
      const drifted = lines.filter((line) => line.trim() !== marker);
      const message = `every seal marker must match ${PARTIAL} exactly:\n  ${drifted.join('\n  ')}`;
      expect(drifted, message).toEqual([]);
    });
  });

  it('emits the same marker from the frontmatter script', async () => {
    const marker = await readMarker();
    const script = await readFile(path.join(CONTENT_ROOT, SCRIPT), 'utf8');
    const message = `${SCRIPT} must emit the marker stated in ${PARTIAL}; the two have drifted.`;
    expect(script.includes(`'${marker}'`), message).toBe(true);
  });
});

// region | Helpers

/** Reads the marker line the partial states, which is the single source both the carriers and the script answer to. */
async function readMarker(): Promise<string> {
  const partial = await readFile(path.join(CONTENT_ROOT, PARTIAL), 'utf8');
  return partial.trim();
}

// endregion | Helpers
