import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';
import { isUnderTestDirectory } from '../../src/lib/fs-helpers.ts';

// An include and a guidance hook both splice content that has its own headings, so a host heading deeper than the
// injected content's shallowest one renders as a subsection of the injection rather than of the host body. For a hook
// the parent is worse than misattributed: it is whichever rulebook the local binding supplied.
//
// The scan reads source rather than rendered output. Once includes expand, an inlined partial is byte-identical to the
// text around it, and no pass over the result can tell a host heading from an injected one.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

// Mirrors of the production grammars in `directive-expander.ts` and `guidance-hooks.ts`: each occupies a full line
// and matches despite surrounding whitespace, and self-close is tested before open so a path ending in `/` reads as
// a self-close.
const CLOSE_INCLUDE_REGEX = /^[ \t]*<!--[ \t]*\/include[ \t]*-->[ \t]*$/;
const FENCE_REGEX = /^\s*(`{3,}|~{3,})/;
const HEADING_REGEX = /^(#{1,6})\s/;
const HOOK_DIRECTIVE_REGEX = /^[ \t]*<!--[ \t]*guidance-hook:[ \t]*.*?[ \t]*-->[ \t]*$/;
const OPEN_INCLUDE_REGEX = /^[ \t]*<!--[ \t]*include:[ \t]*(\S+)[ \t]*-->[ \t]*$/;
const SELF_CLOSE_INCLUDE_REGEX = /^[ \t]*<!--[ \t]*include:[ \t]*(\S+?)[ \t]*\/[ \t]*-->[ \t]*$/;

/** The level a bound rulebook's title renders at: `fillGuidanceHooks` demotes every heading in the fill by one. */
const HOOK_FILL_LEVEL = 2;

/** A heading the host body declares itself, outside any fence or slot region. */
interface Heading {
  readonly kind: 'heading';
  readonly lineNumber: number;
  readonly level: number;
  readonly text: string;
}

/** A directive and the level its injected content starts at, against which a following host heading is judged. */
interface Injection {
  readonly kind: 'injection';
  readonly lineNumber: number;
  readonly shallowestLevel: number;
  readonly text: string;
}

/** One source line that contributes structure, paired with the 1-based line it occupies. */
interface LiveLine {
  readonly lineNumber: number;
  readonly text: string;
}

type Token = Heading | Injection;

const levelByPartial = new Map<string, number | undefined>();

describe('injection-point placement', () => {
  it('no directive reparents the section following it', async () => {
    const violations: Array<string> = [];
    const relativePaths = await listContentMarkdown();
    for (const relativePath of relativePaths) {
      violations.push(...(await findViolations(relativePath)));
    }

    expect(
      violations,
      `These directives inject content whose headings adopt the section below them:\n  ${violations.join('\n  ')}\n` +
        `A host heading following a directive must sit at or above the injected content's shallowest heading level. ` +
        `Promote the section, or move the directive below it.`,
    ).toEqual([]);
  });
});

// region | Helpers

/**
 * Reports each directive in one body whose next host heading is deeper than the content it injects, rendered as one
 * line per violation. Two directives sharing a following heading are both reported: each is independently misplaced.
 */
async function findViolations(relativePath: string): Promise<ReadonlyArray<string>> {
  const violations: Array<string> = [];
  const open: Array<Injection> = [];

  const tokens = await readStructure(relativePath);
  for (const token of tokens) {
    if (token.kind === 'injection') {
      open.push(token);
      continue;
    }
    for (const injection of open) {
      if (token.level > injection.shallowestLevel) {
        violations.push(
          `${relativePath}:${injection.lineNumber} ${injection.text} (injects h${injection.shallowestLevel}) ` +
            `adopts ${relativePath}:${token.lineNumber} ${token.text}`,
        );
      }
    }
    open.length = 0;
  }

  return violations;
}

/** Returns every Markdown file under `content/`, as paths relative to it. */
async function listContentMarkdown(): Promise<ReadonlyArray<string>> {
  const entries = await readdir(CONTENT_ROOT, { recursive: true });
  return entries.filter((entry) => entry.endsWith('.md') && !isUnderTestDirectory(entry)).toSorted();
}

/**
 * Yields the lines of a body that contribute structure, skipping every line inside a fenced block. A `#` inside a
 * fence is content, so the fence is tracked rather than each line matched in isolation. A fenced directive is skipped
 * for a different reason: the expander tracks no fences and still expands it, but the fence turns the headings it
 * injects into literal text, which adopts nothing.
 */
function* readLiveLines(body: string): Generator<LiveLine> {
  let openFence: string | undefined;
  for (const [index, text] of body.split('\n').entries()) {
    const fence = FENCE_REGEX.exec(text)?.[1];
    if (openFence !== undefined) {
      if (fence !== undefined && fence[0] === openFence[0] && fence.length >= openFence.length) {
        openFence = undefined;
      }
      continue;
    }
    if (fence !== undefined) {
      openFence = fence;
      continue;
    }
    yield { lineNumber: index + 1, text };
  }
}

/**
 * Returns the shallowest level a partial contributes, or `undefined` when it contributes nothing a following section
 * could nest under. A hook the partial declares counts at the fill level: hooks resolve after includes expand, so such
 * a hook fills inside the host and can splice shallower than the partial's own headings. Memoized, since one partial
 * reaches many consumers.
 */
async function readPartialLevel(partialPath: string): Promise<number | undefined> {
  if (!levelByPartial.has(partialPath)) {
    const expanded = await expandIncludes(partialPath, CONTENT_ROOT);
    let shallowest: number | undefined;
    for (const { text } of readLiveLines(expanded)) {
      const level = HOOK_DIRECTIVE_REGEX.test(text) ? HOOK_FILL_LEVEL : HEADING_REGEX.exec(text)?.[1]?.length;
      if (level !== undefined && (shallowest === undefined || level < shallowest)) {
        shallowest = level;
      }
    }
    levelByPartial.set(partialPath, shallowest);
  }
  return levelByPartial.get(partialPath);
}

/**
 * Reads one body's headings and injection points in source order. Lines between an open include directive and its
 * `<!-- /include -->` are slot content bound for the partial's `<!-- children -->`, not structure of this body, and a
 * partial that places that placeholder inside a fence turns them into example text, so they contribute no token.
 */
async function readStructure(relativePath: string): Promise<ReadonlyArray<Token>> {
  const filePath = path.join(CONTENT_ROOT, relativePath);
  const body = await readFile(filePath, 'utf8');
  const tokens: Array<Token> = [];
  let inSlot = false;

  for (const { lineNumber, text } of readLiveLines(body)) {
    if (inSlot) {
      inSlot = !CLOSE_INCLUDE_REGEX.test(text);
      continue;
    }

    const partial = SELF_CLOSE_INCLUDE_REGEX.exec(text)?.[1] ?? OPEN_INCLUDE_REGEX.exec(text)?.[1];
    if (partial !== undefined) {
      inSlot = !SELF_CLOSE_INCLUDE_REGEX.test(text);
      const shallowestLevel = await readPartialLevel(path.resolve(path.dirname(filePath), partial));
      if (shallowestLevel !== undefined) {
        tokens.push({ kind: 'injection', lineNumber, shallowestLevel, text: text.trim() });
      }
      continue;
    }

    if (HOOK_DIRECTIVE_REGEX.test(text)) {
      tokens.push({ kind: 'injection', lineNumber, shallowestLevel: HOOK_FILL_LEVEL, text: text.trim() });
      continue;
    }

    const level = HEADING_REGEX.exec(text)?.[1]?.length;
    if (level !== undefined) {
      tokens.push({ kind: 'heading', lineNumber, level, text: text.trim() });
    }
  }

  return tokens;
}

// endregion | Helpers
