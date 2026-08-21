import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';
import { countOccurrences } from '../test-utils/count-occurrences.ts';

// Every saved artifact carries the seal marker, which puts the prohibition in the file an agent has open rather than
// only in the standing guidance it may not have loaded. `resolve-frontmatter.sh` emits it for the callers that prepend
// its YAML output; the carriers below write their own frontmatter or their own template, so each inlines the partial.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** The one Markdown file permitted to state the marker; every carrier reaches it through an include. */
const PARTIAL = '_partials/seal-marker.md';

/** The shell constant the script emits, which must not drift from the partial. */
const SCRIPT = 'scripts/resolve-frontmatter.sh';

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
    it('inlines the marker exactly once', async () => {
      const marker = await readMarker();
      const expanded = await expandIncludes(path.join(CONTENT_ROOT, relativePath), CONTENT_ROOT);
      expect(countOccurrences(expanded, marker)).toBe(1);
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
