import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// A dispatch block hands a subagent the scalars that it was not able to derive, and nothing else. A prose value
// there makes the caller the author of the facts and the subagent a rewriter of them, which is worth nothing when the
// subagent's value is its fresh context. Such a value does not fail at runtime -- it produces a plausible lede
// carrying the caller's weighting -- so the guard has to be here.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** Info string marking a fence as a subagent dispatch block. */
const FENCE_INFO = 'dispatch';

/** A line that a dispatch block may carry: a lowercase kebab-case key, a colon and a space, and a non-empty value. */
const SCALAR_LINE = /^[a-z][a-z0-9-]*: \S/;

/**
 * A value opening a YAML block scalar, which is the shape that a seeding sentence takes even before its body is
 * written.
 */
const BLOCK_SCALAR_VALUE = /^[a-z][a-z0-9-]*: [|>][+-]?$/;

/**
 * Every key that a dispatch block may carry. The shape check alone admits a one-line `outcome:` sentence, which seeds
 * the drafter exactly as the block form does, so the closed set makes the check a guard rather than a formality.
 */
const DECLARED_KEYS: ReadonlySet<string> = new Set([
  'candidates',
  'files',
  'rejection',
  'rejections',
  'root',
  'rules',
  'ticket-source',
  'tier',
  'title',
  'type',
]);

/** One line inside a dispatch block that is not a scalar. */
interface Violation {
  readonly line: number;
  readonly relativePath: string;
  readonly text: string;
}

const BLOCKS = collectDispatchBlocks();

describe('dispatch blocks', () => {
  it('exist somewhere in the content tree', async () => {
    const message =
      `Because no fence carries the \`${FENCE_INFO}\` info string, the scalars-only assertion below passes ` +
      'vacuously. Re-key this suite on the info string that the dispatch blocks carry now, or drop it.';
    expect((await BLOCKS).length, message).toBeGreaterThan(0);
  });

  it('carry scalars alone', async () => {
    const violations = await findViolations((text) => !SCALAR_LINE.test(text) || BLOCK_SCALAR_VALUE.test(text));

    const message =
      'A dispatch block carries the scalars that a subagent cannot derive, and no prose: A sentence written here ' +
      'makes the caller the author of the facts, which is the arrangement replaced by the fresh-context dispatch. ' +
      `These lines are not \`key: value\` scalars:\n  ${violations.map(describeViolation).join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });

  it('carry declared keys alone', async () => {
    const violations = await findViolations((text) => !DECLARED_KEYS.has(readKey(text)));

    const message =
      `A dispatch block carries these keys and no others: ${[...DECLARED_KEYS].toSorted().join(', ')}. An ` +
      'undeclared key is how a seeding sentence enters as a well-formed scalar. Add the key to DECLARED_KEYS if ' +
      `the drafter reads it, and drop it from the block if it does not:\n  ${violations.map(describeViolation).join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});

// region | Helpers

/** One dispatch block: where it came from, and the lines between its fences. */
interface DispatchBlock {
  readonly firstLine: number;
  readonly lines: ReadonlyArray<string>;
  readonly relativePath: string;
}

/** Reads every dispatch block in the content tree, so that both assertions scan it once. */
async function collectDispatchBlocks(): Promise<ReadonlyArray<DispatchBlock>> {
  const files = await listMarkdownFiles(CONTENT_ROOT);
  const blocks: Array<DispatchBlock> = [];

  for (const file of files) {
    const relativePath = path.relative(CONTENT_ROOT, file);
    const content = await readFile(file, 'utf8');
    blocks.push(...findDispatchBlocks(content, relativePath));
  }

  return blocks;
}

/** Renders one violation as `path:line` and the offending text. */
function describeViolation(violation: Violation): string {
  return `${violation.relativePath}:${violation.line} -> ${violation.text.trim()}`;
}

/**
 * Extracts each fenced block whose info string is `dispatch`. The fence may be indented, since a block written inside
 * a numbered step is, and its closing fence is the next one at any indentation.
 */
function findDispatchBlocks(content: string, relativePath: string): ReadonlyArray<DispatchBlock> {
  const lines = content.split('\n');
  const blocks: Array<DispatchBlock> = [];
  let openedAt: number | undefined;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (openedAt === undefined) {
      if (trimmed === `\`\`\`${FENCE_INFO}`) {
        openedAt = index;
      }
      continue;
    }
    if (trimmed.startsWith('```')) {
      blocks.push({
        firstLine: openedAt + 2,
        lines: lines.slice(openedAt + 1, index).map((l) => l.trim()),
        relativePath,
      });
      openedAt = undefined;
    }
  }

  return blocks;
}

/** Returns every non-blank dispatch-block line rejected by the predicate, located for the failure message. */
async function findViolations(isViolation: (text: string) => boolean): Promise<ReadonlyArray<Violation>> {
  return (await BLOCKS).flatMap((block) =>
    block.lines
      .map((text, index) => ({ text, line: block.firstLine + index }))
      .filter(({ text }) => text.trim() !== '' && isViolation(text))
      .map(({ text, line }) => ({ line, relativePath: block.relativePath, text })),
  );
}

/** Reads the key from a `key: value` line, returning the empty string when the line carries none. */
function readKey(text: string): string {
  return /^([a-z][a-z0-9-]*):/.exec(text)?.[1] ?? '';
}

// endregion | Helpers
