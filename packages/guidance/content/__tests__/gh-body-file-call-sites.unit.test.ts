import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { DOCTRINE_REACH } from '../test-utils/doctrine-reach.ts';

// `gh` accepts `--body-file ""` without complaint and publishes its own default body, so a call site that invokes the
// CLI with an unset path fails silently. `doctrine-reach.unit.test.ts` checks that each carrier inlines the contract;
// this file checks that the calls written in each carrier follow it.

const CONTRACT = readContract();

/**
 * A body-file argument and the variable that it passes; `acli` names the description flag on its create call, and
 * `describe-change.mjs` names the pull-request body `--pr-body-file`. Capturing the variable ties the guard to the
 * path that the call actually passes, rather than to any guard that the block happens to contain: A carrier is created
 * by copying an existing block, and a renamed path with an un-renamed guard is the drift that copying produces.
 */
const BODY_FILE_ARGUMENT = /--(?:body|description|pr-body)-file "\$(\w+)"/g;

/** The guard itself, which turns a missing or empty body file into a refusal. */
const GUARD = '[ -s "$body_path" ]';

describe('gh-body-file call sites', () => {
  it('includes the guard in the partial', async () => {
    const partial = await readFile(path.join(CONTENT_ROOT, CONTRACT.source), 'utf8');
    expect(partial).toContain(GUARD);
  });

  it('guards every call that passes a body file', async () => {
    const violations: Array<string> = [];
    for (const relativePath of CONTRACT.carriers) {
      const content = await readFile(path.join(CONTENT_ROOT, relativePath), 'utf8');
      for (const block of listShellBlocks(content)) {
        for (const variable of listBodyFileVariables(block)) {
          if (block.includes(`[ -s "$${variable}" ]`)) continue;
          violations.push(`${relativePath} -> $${variable}`);
        }
      }
    }
    const message = `An unguarded body-file call publishes the platform's default body when the path is unset; these paths are passed to a CLI without a guard on the variable that the call passes:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });

  it('passes literal paths to the merge-gh-pr helper, without shell composition', async () => {
    const content = await readFile(path.join(CONTENT_ROOT, 'skills/merge-gh-pr/SKILL.md'), 'utf8');
    const helperBlocks = listShellBlocks(content).filter((block) => block.includes('merge-gh-pr.mjs'));

    expect(helperBlocks).toHaveLength(1);
    for (const block of helperBlocks) {
      expect(block).not.toContain('$');
      expect(block).not.toMatch(/\{\s/);
      expect(block).not.toContain('gh api');
    }
  });
});

// region | Helpers

/** Returns the variable passed by each of a block's body-file arguments, one entry per argument. */
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

/** Returns the `gh-body-file` row of the reach table, which names the partial and the files that carry it. */
function readContract(): (typeof DOCTRINE_REACH)[string] {
  const contract = DOCTRINE_REACH['gh-body-file'];
  if (contract === undefined) throw new Error('The reach table does not contain gh-body-file');
  return contract;
}

// endregion | Helpers
