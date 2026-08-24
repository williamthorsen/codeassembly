import { MARKDOWN_LINK_REGEX } from './path-rewriter.ts';

/** An anchor-only link target, up to the whitespace that would begin a Markdown link title. */
const ANCHOR_TARGET_REGEX = /^#\S*/;

/** An inline code span: a backtick run, same-line content, and a closing run of the same length. */
const CODE_SPAN_REGEX = /(`+)[^\n`]*\1/g;

/** A fenced code block's opening or closing marker: three or more backticks, or three or more tildes. */
const FENCE_REGEX = /^\s*(`{3,}|~{3,})/;

/** A top-level YAML key, the shape that tells a frontmatter block from a pair of thematic breaks. */
const FRONTMATTER_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_-]*\s*:(\s|$)/;

/** The ATX heading grammar this module derives anchors from. No content file uses the setext form. */
const HEADING_REGEX = /^(#{1,6})\s+(.+?)\s*$/gm;

/** A heading's anchor slug, its ATX level, and the index in the body where its line begins. */
export interface HeadingPosition {
  readonly slug: string;
  readonly level: number;
  readonly index: number;
}

/** A body's lines with its frontmatter and fenced blocks blanked, plus the opening run of any fence left unclosed. */
interface FenceScan {
  readonly lines: ReadonlyArray<string>;
  readonly unterminated: string | undefined;
}

/**
 * Throws when an anchor-only link target in `body` names no heading, or more than one, in the same body. Every
 * offending target is reported together, so an author fixing an artifact sees the whole list rather than one per run,
 * and a target repeated across the body is reported once.
 *
 * A fence that nothing closes throws too. Everything below it reads as code, so no anchor there can be checked, and a
 * silent pass over an unchecked remainder is indistinguishable from a clean one.
 *
 * `body` is checked before any rewriting, and where the pipeline expands includes, after that expansion. Rewriting
 * leaves anchor-only targets untouched, so the verdict is harness-invariant: one failure per artifact, phrased against
 * the file the author edits, rather than one per harness. That ordering also settles the case rewriting would confuse,
 * since a heading carrying a `{tool:NAME}` token slugs differently on each harness and so can be addressed by no
 * single fragment.
 *
 * Only same-body anchors are checked. A fragment on a path target resolves against the deployed tree, which unions
 * library content with each declared source's content, so it cannot be settled from the one content root at hand.
 */
export function assertAnchorsResolve(body: string, sourceLabel: string): void {
  const scan = scanFences(body);
  if (scan.unterminated !== undefined) {
    throw new Error(
      `${sourceLabel} opens a code fence with ${scan.unterminated} that nothing closes, so every anchor below it ` +
        'goes unchecked. A closing fence repeats the same character at least as many times as the opening run.',
    );
  }

  const normalized = scan.lines.join('\n');
  const headings = collectHeadingSlugs(normalized);

  const rejections: Array<string> = [];
  const seen = new Set<string>();
  for (const match of blankCodeSpans(normalized).matchAll(MARKDOWN_LINK_REGEX)) {
    const target = readAnchorTarget(match[2]);
    if (target === undefined || seen.has(target)) {
      continue;
    }
    seen.add(target);

    const matches = headings.get(target.slice(1)) ?? 0;
    if (matches === 0) {
      rejections.push(`  ${target} -- names no heading`);
    } else if (matches > 1) {
      rejections.push(`  ${target} -- names ${matches} headings`);
    }
  }

  if (rejections.length > 0) {
    throw new Error(
      `${sourceLabel} carries ${rejections.length} unresolvable anchor link target(s). An anchor-only target must ` +
        `name exactly one heading in the same body:\n${rejections.join('\n')}\n` +
        'If a target was authored in an inlined _partials/ file, fix it there rather than in the file named above.',
    );
  }
}

/**
 * Lists every heading in `normalized` in document order, each with the index where its line begins. Expects the
 * output of `normalizeForAnchorScan`, for the reason `collectHeadingSlugs` gives.
 *
 * The index and level are what let a caller attribute a passage to the section holding it, and to that section's
 * ancestors: a slug count answers whether an anchor resolves, never what lies under it.
 */
export function collectHeadingPositions(normalized: string): ReadonlyArray<HeadingPosition> {
  return Array.from(normalized.matchAll(HEADING_REGEX), (match) => ({
    slug: slugifyHeading(match[2] ?? ''),
    level: (match[1] ?? '').length,
    index: match.index,
  }));
}

/**
 * Counts each heading slug in `normalized`, so a fragment matching two headings is rejected rather than resolved
 * against whichever came first. Expects the output of `normalizeForAnchorScan`: an unnormalized body would offer a
 * fenced sample heading as a live target.
 */
export function collectHeadingSlugs(normalized: string): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const { slug } of collectHeadingPositions(normalized)) {
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return counts;
}

/**
 * Reports the opening run of a fenced code block that nothing closes, or `undefined` when every fence in `content` is
 * closed. `assertAnchorsResolve` throws on this condition; a caller that collects results instead of throwing has to
 * ask for it, because a body with an open fence is unscannable below that point and its clean result means nothing.
 */
export function findUnterminatedFence(content: string): string | undefined {
  return scanFences(content).unterminated;
}

/**
 * Blanks the block-level regions that illustrate rather than declare: a leading frontmatter block and every fenced
 * code block. A fence shows sample output, so a heading inside one offers no anchor and a link inside one requests
 * none; `review-branch` prints a `## Specification consistency` heading inside its output-format fence, which a naive
 * scan would offer as a real target. Blanking frontmatter keeps a Markdown link in a `description:` from being scanned
 * as a body link.
 *
 * Inline code spans survive here and are blanked on the link-scanning side alone. A span inside a heading is part of
 * that heading's text, and dropping it would change the slug: `### The \`respond-to-review\` path` anchors as
 * `#the-respond-to-review-path`, which the slugifier already reaches by stripping backticks as punctuation.
 *
 * An indented code block is not recognized. Telling one from a nested list item needs block-level parsing, and getting
 * that wrong would blank a list item's real anchor, which fails toward accepting a dead locator.
 *
 * Blanking preserves line count and column positions, so every surviving character keeps its place in the body.
 */
export function normalizeForAnchorScan(content: string): string {
  return scanFences(content).lines.join('\n');
}

// region | Helpers

/**
 * Blanks inline code spans, so a link written inside one is read as an illustration rather than a request. Applies to
 * link scanning only: a span inside a heading contributes to that heading's slug and must survive `collectHeadingSlugs`.
 *
 * A span is matched within one line. A code span may span lines, but a runaway match across a stray backtick would
 * blank real anchors, and losing a locator to a silent pass is the failure this module exists to prevent.
 */
function blankCodeSpans(content: string): string {
  return content.replace(CODE_SPAN_REGEX, (span) => ' '.repeat(span.length));
}

/**
 * Reports the index of the first body line, skipping a leading frontmatter block. A block is recognized only when the
 * first line is exactly `---`, a later `---` closes it, and the lines between carry a top-level YAML key. A body
 * opening on a thematic break satisfies the first two and fails the third, so its headings are scanned rather than
 * blanked; an unterminated or empty block counts as body for the same reason, since scanning is the direction that
 * cannot skip the check. A YAML comment is not the discriminator, because `# Text` is also an ATX heading.
 *
 * A prose line of the form `Word: text` at column zero inside a thematic-break pair reads as a key. Real frontmatter
 * always carries one, so the recognition is loose in that one direction rather than tight enough to miss it.
 */
function findBodyStart(lines: ReadonlyArray<string>): number {
  if (lines[0] !== '---') {
    return 0;
  }
  const closingIndex = lines.indexOf('---', 1);
  if (closingIndex === -1) {
    return 0;
  }
  return lines.slice(1, closingIndex).some((line) => FRONTMATTER_KEY_REGEX.test(line)) ? closingIndex + 1 : 0;
}

/**
 * Reads the anchor a link target addresses, or `undefined` when the target names something other than a heading in
 * this body. A Markdown link title (`#section "Some title"`) is dropped, so a titled link is resolved on its fragment
 * rather than rejected for a fragment it never had.
 */
function readAnchorTarget(target: string | undefined): string | undefined {
  return target === undefined ? undefined : (ANCHOR_TARGET_REGEX.exec(target.trim())?.[0] ?? undefined);
}

/**
 * Walks `content` a line at a time, blanking its frontmatter and every fenced code block, and reports the opening run
 * of a fence nothing closed. A block closes only on a marker of the same character and at least the opening length,
 * which is what lets a fenced example carry a shorter fence of its own.
 */
function scanFences(content: string): FenceScan {
  const lines = content.split('\n');
  const bodyStart = findBodyStart(lines);
  let fence: string | undefined;

  const blanked = lines.map((line, index) => {
    if (index < bodyStart) {
      return '';
    }
    const marker = FENCE_REGEX.exec(line)?.[1];
    if (fence === undefined) {
      if (marker === undefined) {
        return line;
      }
      fence = marker;
      return '';
    }
    if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) {
      fence = undefined;
    }
    return '';
  });

  return { lines: blanked, unterminated: fence };
}

/**
 * Derives a heading's anchor the way GitHub does: lowercase, drop everything but letters, numbers, spaces, and
 * hyphens, then map each remaining space to a hyphen. Runs of spaces are preserved rather than collapsed, because
 * stripping punctuation between two spaces is what yields the double hyphen in an anchor such as
 * `#finding-scheme-fwtrs--legacy-suffix`.
 */
function slugifyHeading(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .replaceAll(' ', '-');
}

// endregion | Helpers
