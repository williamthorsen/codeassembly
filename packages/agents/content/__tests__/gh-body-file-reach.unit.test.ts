import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';
import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// `gh` accepts `--body-file ""` without complaint and publishes its own default body, so a call site that reaches
// the CLI with an unset path fails silently. The contract binds only where it is already in context as the call is
// composed. Each carrier inlines it rather than linking to it, for the reason the `_partials` README gives: a
// runtime link is an optional read, and the model fills from its prior instead.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** The one file permitted to state the contract; every carrier reaches it through an include. */
const PARTIAL = 'skills/_partials/gh-body-file.md';

/**
 * The contract's opening, which the single-statement counts key on. Where the file goes is the scratch-directory
 * contract's rule rather than this one's, so it is asserted in `shared-doctrine-reach.unit.test.ts` instead; this
 * contract picks up at naming the file.
 */
const CONTRACT_HEADLINE = 'Name the file for its consumer.';

/** Phrases that must survive an edit to the partial, so a gutted contract cannot still pass on its opening alone. */
const CONTRACT_PHRASES: ReadonlyArray<string> = [
  CONTRACT_HEADLINE,
  'Assign the path and guard it inside the call that consumes it.',
  'publishes its own default body in place of the composed one',
];

/**
 * A body-file argument and the variable it passes; `acli` names the description flag on its create call. Capturing the
 * variable is what ties the guard to the path the call actually passes, rather than to any guard the block happens to
 * carry: a carrier arrives by copying an existing block, and a renamed path with an un-renamed guard is the drift that
 * copying produces.
 */
const BODY_FILE_ARGUMENT = /--(?:body|description)-file "\$(\w+)"/g;

/** The guard itself, which is what turns a missing or empty body file into a refusal. */
const GUARD = '[ -s "$body_path" ]';

// Listed explicitly rather than discovered: the failure guarded against is a carrier dropping off the list, and a
// discovered list would move with the bug.
//
// A place here goes to a file that composes a body and hands it to a CLI through a file. `merge-pr` is absent
// because it composes the merge body and delegates the call, and the Bitbucket delegates are absent because they
// submit a body inline through the API.
const CARRIERS: ReadonlyArray<string> = [
  'skills/_data/gh-body-file.md',
  'skills/_data/ticket-source-resolution.md',
  'skills/condense-branch/SKILL.md',
  'skills/create-commit/SKILL.md',
  'skills/create-gh-pr/SKILL.md',
  'skills/create-ticket/SKILL.md',
  'skills/merge-gh-pr/SKILL.md',
  'skills/wrap-up/SKILL.md',
];

describe('gh-body-file reach', () => {
  describe.each(CARRIERS)('%s', (relativePath) => {
    it('inlines the contract', async () => {
      const expanded = await expandCarrier(relativePath);
      for (const phrase of CONTRACT_PHRASES) {
        expect(expanded).toContain(phrase);
      }
    });

    it('inlines the contract exactly once', async () => {
      const expanded = await expandCarrier(relativePath);
      expect(countOccurrences(expanded, CONTRACT_HEADLINE)).toBe(1);
    });
  });

  it('carries the guard in the partial', async () => {
    const partial = await readFile(path.join(CONTENT_ROOT, PARTIAL), 'utf8');
    expect(partial).toContain(GUARD);
  });

  it('guards every call that passes a body file', async () => {
    const violations: Array<string> = [];
    for (const relativePath of CARRIERS) {
      const content = await readFile(path.join(CONTENT_ROOT, relativePath), 'utf8');
      for (const block of listShellBlocks(content)) {
        for (const variable of listBodyFileVariables(block)) {
          if (block.includes(`[ -s "$${variable}" ]`)) continue;
          violations.push(`${relativePath} -> $${variable}`);
        }
      }
    }
    const message = `An unguarded body-file call publishes the platform's default body when the path is unset; these paths reach a CLI without a guard on the variable the call passes:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });

  it('states the path rule in no content file but the partial', async () => {
    const violations: Array<string> = [];
    const files = await listMarkdownFiles(CONTENT_ROOT);
    for (const file of files) {
      const relativePath = path.relative(CONTENT_ROOT, file);
      if (relativePath === PARTIAL) continue;

      const content = await readFile(file, 'utf8');
      for (const phrase of CONTRACT_PHRASES) {
        if (content.includes(phrase)) {
          violations.push(`${relativePath} -> ${phrase}`);
        }
      }
    }
    const message = `The contract is stated once and inlined from there; these files restate it instead of including it:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});

// region | Helpers

/** Returns a carrier's include-expanded body, what the install pipeline goes on to rewrite and write out. */
async function expandCarrier(relativePath: string): Promise<string> {
  return expandIncludes(path.join(CONTENT_ROOT, relativePath), CONTENT_ROOT);
}

/** Returns the variable each of a block's body-file arguments passes, one entry per argument. */
function listBodyFileVariables(block: string): Array<string> {
  const variables: Array<string> = [];
  for (const match of block.matchAll(BODY_FILE_ARGUMENT)) {
    const variable = match[1];
    if (variable !== undefined) variables.push(variable);
  }
  return variables;
}

/** Returns the bodies of a Markdown file's fenced `bash` blocks, indented ones inside list items included. */
function listShellBlocks(content: string): Array<string> {
  const blocks: Array<string> = [];
  const pattern = /^[ \t]*```bash\n([\s\S]*?)^[ \t]*```$/gm;
  let match = pattern.exec(content);
  while (match !== null) {
    const body = match[1];
    if (body !== undefined) blocks.push(body);
    match = pattern.exec(content);
  }
  return blocks;
}

// endregion | Helpers
