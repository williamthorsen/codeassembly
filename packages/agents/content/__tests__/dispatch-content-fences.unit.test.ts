import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// A content fence is the one channel that hands a subagent text rather than scalars: the candidates a cutter chooses
// among, and the passages a redispatched drafter revises. Everything the fence carries is copied from a subagent's
// own earlier return, so the caller writes none of it. A sentence templated here would seed the subagent exactly as
// a prose scalar in the dispatch block does, which `dispatch-block-scalars` forbids by holding that block's keys to
// a closed set. Neither failure shows at runtime -- each yields a plausible lede carrying the caller's weighting --
// so the guard has to be here.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** Every info string a content fence may carry. A channel absent from this set is one nothing reviewed. */
const DECLARED_FENCES: ReadonlySet<string> = new Set(['candidates', 'rejected']);

/** A line a content fence may carry: a bullet whose whole content is one placeholder the caller fills at dispatch. */
const PLACEHOLDER_LINE = /^- \{[^{}]*\}$/;

/** One offending fence line, or one fence's undeclared info string, located for the failure message. */
interface Violation {
  readonly line: number;
  readonly relativePath: string;
  readonly text: string;
}

const FENCES = collectFences();

describe('content fences', () => {
  it('exist for every declared info string', async () => {
    const found = new Set((await FENCES).map((fence) => fence.info));
    const missing = [...DECLARED_FENCES].filter((info) => !found.has(info));

    const message =
      'Each declared info string names a channel some skill sends. One that no fence carries makes its half of the ' +
      `assertions below pass vacuously, so drop it from DECLARED_FENCES:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('carry placeholders alone', async () => {
    const violations = (await FENCES)
      .filter((fence) => DECLARED_FENCES.has(fence.info))
      .flatMap((fence) =>
        fence.lines
          .map((text, index) => ({ line: fence.firstLine + index, relativePath: fence.relativePath, text }))
          .filter(({ text }) => text !== '' && !PLACEHOLDER_LINE.test(text)),
      );

    const message =
      "A content fence carries placeholders the caller fills with a subagent's own earlier text, and no prose: a " +
      'sentence templated here makes the caller the author of the facts, which is the arrangement the fresh-context ' +
      `dispatch replaced. These lines are not placeholder bullets:\n  ${violations.map(describeViolation).join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });

  it('declare every info string that carries placeholders', async () => {
    const violations = (await FENCES)
      .filter((fence) => !DECLARED_FENCES.has(fence.info) && fence.lines.every((text) => PLACEHOLDER_LINE.test(text)))
      .map((fence) => ({ line: fence.firstLine - 1, relativePath: fence.relativePath, text: fence.info }));

    const message =
      'A fence carrying placeholder bullets is a content channel whatever it is named, and an undeclared one is a ' +
      'channel that reached a subagent without review. Add it to DECLARED_FENCES where a subagent reads it, and ' +
      `drop the fence where none does:\n  ${violations.map(describeViolation).join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});

// region | Helpers

/** One fenced block: where it came from, what its info string is, and the lines between its fences. */
interface Fence {
  readonly firstLine: number;
  readonly info: string;
  readonly lines: ReadonlyArray<string>;
  readonly relativePath: string;
}

/** Reads every fence in the content tree, so all three assertions scan it once. */
async function collectFences(): Promise<ReadonlyArray<Fence>> {
  const files = await listMarkdownFiles(CONTENT_ROOT);
  const fences: Array<Fence> = [];

  for (const file of files) {
    const relativePath = path.relative(CONTENT_ROOT, file);
    const content = await readFile(file, 'utf8');
    fences.push(...findFences(content, relativePath));
  }

  return fences;
}

/** Renders one violation as `path:line` and the offending text. */
function describeViolation(violation: Violation): string {
  return `${violation.relativePath}:${violation.line} -> ${violation.text}`;
}

/**
 * Extracts each fenced block and its info string. The fence may be indented, since a block written inside a numbered
 * step is, and its closing fence is the next one at any indentation. Blank lines are dropped, so a fence's emptiness
 * is decided by its content rather than its spacing.
 */
function findFences(content: string, relativePath: string): ReadonlyArray<Fence> {
  const lines = content.split('\n');
  const fences: Array<Fence> = [];
  let openedAt: number | undefined;
  let info = '';

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (openedAt === undefined) {
      const opening = /^```([a-zA-Z][\w-]*)?$/.exec(trimmed);
      if (opening) {
        openedAt = index;
        info = opening[1] ?? '';
      }
      continue;
    }
    if (trimmed.startsWith('```')) {
      const body = lines.slice(openedAt + 1, index).map((bodyLine) => bodyLine.trim());
      if (body.some((text) => text !== '')) {
        fences.push({ firstLine: openedAt + 2, info, lines: body, relativePath });
      }
      openedAt = undefined;
    }
  }

  return fences;
}

// endregion | Helpers
