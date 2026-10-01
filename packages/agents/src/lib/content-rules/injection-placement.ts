import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import type { ContentDefect } from '../content-defects.ts';
import {
  CLOSE_INCLUDE_REGEX,
  expandIncludes,
  OPEN_INCLUDE_REGEX,
  SELF_CLOSE_INCLUDE_REGEX,
} from '../directive-expander.ts';
import { listMarkdownFilesRecursively } from '../fs-helpers.ts';
import { FENCE_REGEX, HEADING_REGEX, HOOK_DIRECTIVE_REGEX, HOOK_FILL_LEVEL } from '../guidance-hooks.ts';
import { type RuleContext, toRootRelative } from './rule-context.ts';

/** A heading that the host body declares itself, outside any fence or slot region. */
interface Heading {
  readonly kind: 'heading';
  readonly lineNumber: number;
  readonly level: number;
  readonly text: string;
}

/** A directive and the level at which its injected content starts, against which a following host heading is judged. */
interface Injection {
  readonly kind: 'injection';
  readonly lineNumber: number;
  readonly shallowestLevel: number;
  readonly text: string;
}

/** One source line that contributes structure, paired with the 1-based line that it occupies. */
interface LiveLine {
  readonly lineNumber: number;
  readonly text: string;
}

type Token = Heading | Injection;

/** The shallowest heading level that each partial contributes, memoized for one run since a partial reaches many hosts. */
type PartialLevels = Map<string, number | undefined>;

/**
 * Reports each include or guidance-hook directive, in any Markdown file under the root, whose next host heading is
 * deeper than the shallowest heading of the content that the directive injects. Such a heading renders as a
 * subsection of the injection rather than of the host; for a hook, the parent is whichever rulebook the binding
 * supplied. Two directives sharing a following heading are both reported, since each is independently misplaced.
 *
 * The scan reads source rather than rendered output. Once includes expand, an inlined partial is byte-identical to the
 * text around it, and a pass over the result cannot tell a host heading from an injected one.
 */
export async function findInjectionPlacementDefects({ root }: RuleContext): Promise<ReadonlyArray<ContentDefect>> {
  const levels: PartialLevels = new Map();
  const defects: Array<ContentDefect> = [];

  const files = await listMarkdownFilesRecursively(root);
  for (const file of files) {
    const relativePath = toRootRelative(root, file);
    let tokens: ReadonlyArray<Token>;
    try {
      tokens = await readStructure(file, root, levels);
    } catch (error: unknown) {
      defects.push({ file: relativePath, kind: 'heading', detail: describeError(error) });
      continue;
    }

    const open: Array<Injection> = [];
    for (const token of tokens) {
      if (token.kind === 'injection') {
        open.push(token);
        continue;
      }
      for (const injection of open) {
        if (token.level > injection.shallowestLevel) {
          defects.push({
            file: relativePath,
            kind: 'heading',
            detail:
              `Line ${injection.lineNumber} \`${injection.text}\` injects content opening at h${injection.shallowestLevel}, ` +
              `so line ${token.lineNumber} \`${token.text}\` renders as its subsection. Promote the section, or move the ` +
              'directive below it.',
          });
        }
      }
      open.length = 0;
    }
  }
  return defects;
}

// region | Helpers

/**
 * Returns the shallowest level that a partial contributes, or `undefined` when it contributes nothing that a following
 * section could nest under. A hook that the partial declares counts at the fill level: Hooks resolve after includes
 * expand, so such a hook fills inside the host and can splice shallower than the partial's own headings.
 */
async function readPartialLevel(partialPath: string, root: string, levels: PartialLevels): Promise<number | undefined> {
  if (!levels.has(partialPath)) {
    const expanded = await expandIncludes(partialPath, root);
    let shallowest: number | undefined;
    for (const { text } of readLiveLines(expanded)) {
      const level = HOOK_DIRECTIVE_REGEX.test(text) ? HOOK_FILL_LEVEL : HEADING_REGEX.exec(text)?.[1]?.length;
      if (level !== undefined && (shallowest === undefined || level < shallowest)) {
        shallowest = level;
      }
    }
    levels.set(partialPath, shallowest);
  }
  return levels.get(partialPath);
}

/**
 * Yields the lines of a body that contribute structure, skipping every line inside a fenced block. A fenced directive
 * is skipped too: The expander still expands it, but the fence turns the headings that it injects into literal text,
 * which adopts nothing.
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
 * Reads one body's headings and injection points in source order. Lines between an open include directive and its
 * `<!-- /include -->` are slot content bound for the partial's `<!-- children -->`, not structure of this body, so
 * they do not contribute a token.
 */
async function readStructure(file: string, root: string, levels: PartialLevels): Promise<ReadonlyArray<Token>> {
  const body = await readFile(file, 'utf8');
  const tokens: Array<Token> = [];
  let inSlot = false;

  for (const { lineNumber, text } of readLiveLines(body)) {
    if (inSlot) {
      inSlot = !CLOSE_INCLUDE_REGEX.test(text);
      continue;
    }

    // Self-close is tested first, as in expansion, so a target ending in a slash is not read as an open directive.
    const selfClosed = SELF_CLOSE_INCLUDE_REGEX.exec(text)?.[1];
    const partial = selfClosed ?? OPEN_INCLUDE_REGEX.exec(text)?.[1];
    if (partial !== undefined) {
      inSlot = selfClosed === undefined;
      const shallowestLevel = await readPartialLevel(path.resolve(path.dirname(file), partial), root, levels);
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
