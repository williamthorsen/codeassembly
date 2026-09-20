import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';

// The `pull-request` and `merge` artifacts carry the record marker, which puts the prohibition in the file that an
// agent has open rather than only in the standing guidance that it may not have loaded. No other artifact carries one:
// `capture-lede-decision` reads those two bodies, and a rewrite of either corrupts the lede corpus silently.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** The marker's source of truth; every other statement of it must match this one byte for byte. */
const PARTIAL = '_partials/record-marker.md';

/** Identifies a marker line wherever it appears, so that a drifted copy is found rather than missed. */
const MARKER_KEY = 'Point-in-time record';

// Listed explicitly rather than discovered: The failure guarded against is a carrier dropping off the list, and a
// discovered list would move with the bug.
//
// A carrier is a skill that writes one of the two artifacts that `capture-lede-decision` reads. Every other
// artifact-writing skill and subagent states no marker, which the negative case below enforces.
const CARRIERS: ReadonlyArray<string> = [
  'skills/create-bitbucket-pr/SKILL.md',
  'skills/create-gh-pr/SKILL.md',
  'skills/merge-bb-pr/SKILL.md',
  'skills/merge-gh-pr/SKILL.md',
];

// The artifact specification states the marker to document the two records' opening line, rather than writing one into
// an artifact, so it is a statement of the rule rather than a carrier of it.
const SPECIFICATION = 'skills/_data/artifact-conventions.md';

/** Extensions that could state a marker; the `.mjs` bundles are build output and are not authored here. */
const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set(['.md', '.sh']);

const EXCLUDED_PREFIX = '__tests__/fixtures/';

describe('record-marker reach', () => {
  describe.each(CARRIERS)('%s', (relativePath) => {
    it('carries the marker, and every copy of it matches the partial', async () => {
      const marker = await readMarker();
      const expanded = await expandIncludes(path.join(CONTENT_ROOT, relativePath), CONTENT_ROOT);
      const lines = expanded.split('\n').filter((line) => line.includes(MARKER_KEY));

      expect(lines.length, `${relativePath} states no record marker`).toBeGreaterThanOrEqual(1);

      const drifted = lines.filter((line) => line.trim() !== marker);
      const message = `every record marker must match ${PARTIAL} exactly:\n  ${drifted.join('\n  ')}`;
      expect(drifted, message).toEqual([]);
    });
  });

  it('states the marker nowhere else in the corpus', async () => {
    const permitted = new Set([...CARRIERS, PARTIAL, SPECIFICATION]);
    const offenders: string[] = [];

    const scanned = await listScannedFiles();

    for (const file of scanned) {
      if (permitted.has(file)) continue;

      const content = await readFile(path.join(CONTENT_ROOT, file), 'utf8');
      if (content.includes(MARKER_KEY) || content.includes(PARTIAL)) offenders.push(file);
    }

    const message =
      `the marker belongs to the two artifacts that capture-lede-decision reads; these state it too:\n  ` +
      offenders.join('\n  ');
    expect(offenders, message).toEqual([]);
  });
});

// region | Helpers

/** Returns every file that could state a marker, as content-root-relative POSIX paths. */
async function listScannedFiles(): Promise<ReadonlyArray<string>> {
  const entries = await readdir(CONTENT_ROOT, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SCANNED_EXTENSIONS.has(path.extname(entry.name)))
    .map((entry) => path.relative(CONTENT_ROOT, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .filter((file) => !file.startsWith(EXCLUDED_PREFIX))
    .toSorted();
}

/** Reads the marker line that the partial states, which is the single source to which every carrier answers. */
async function readMarker(): Promise<string> {
  const partial = await readFile(path.join(CONTENT_ROOT, PARTIAL), 'utf8');
  return partial.trim();
}

// endregion | Helpers
