import { MARKDOWN_LINK_REGEX } from './path-rewriter.ts';

/** The ATX heading grammar this module derives anchors from. No content file uses the setext form. */
const HEADING_REGEX = /^#{1,6}\s+(.+?)\s*$/gm;

/**
 * Throws when an anchor-only link target in `body` names no heading, or more than one, in the same body. Every
 * offending target is reported together, so an author fixing an artifact sees the whole list rather than one per run,
 * and a target repeated across the body is reported once.
 *
 * `body` is the include-expanded source, checked before any rewriting. Rewriting leaves anchor-only targets untouched,
 * so the verdict is harness-invariant: one failure per artifact, phrased against the file the author edits, rather
 * than one per harness. That ordering also settles the case rewriting would confuse, since a heading carrying a
 * `{tool:NAME}` token slugs differently on each harness and so can be addressed by no single fragment.
 *
 * Only same-body anchors are checked. A fragment on a path target resolves against the deployed tree, which unions
 * library content with each declared source's content, so it cannot be settled from the one content root at hand.
 */
export function assertAnchorsResolve(body: string, sourceLabel: string): void {
  const normalized = normalizeForAnchorScan(body);
  const headings = collectHeadingSlugs(normalized);

  const rejections: Array<string> = [];
  const seen = new Set<string>();
  for (const match of normalized.matchAll(MARKDOWN_LINK_REGEX)) {
    const target = match[2];
    if (target === undefined || !target.startsWith('#') || seen.has(target)) {
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
        'An anchor authored in a _partials file is reported against each artifact that inlines it, so fix the partial.',
    );
  }
}

/**
 * Counts each heading slug in `normalized`, so a fragment matching two headings is rejected rather than resolved
 * against whichever came first. Expects the output of `normalizeForAnchorScan`: an unnormalized body would offer a
 * fenced sample heading as a live target.
 */
export function collectHeadingSlugs(normalized: string): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const match of normalized.matchAll(HEADING_REGEX)) {
    const slug = slugifyHeading(match[1] ?? '');
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return counts;
}

/**
 * Blanks the regions that illustrate rather than declare: a leading frontmatter block, and every fenced code block. A
 * fence shows sample output, so a heading inside one offers no anchor and a link inside one requests none;
 * `review-branch` prints a `## Specification consistency` heading inside its output-format fence, which a naive scan
 * would offer as a real target. Blanking frontmatter keeps a Markdown link in a `description:` from being scanned as
 * a body link.
 *
 * Lines are blanked rather than removed, so every surviving line keeps its position in the body.
 */
export function normalizeForAnchorScan(content: string): string {
  const lines = content.split('\n');
  const bodyStart = findBodyStart(lines);
  let inFence = false;

  return lines
    .map((line, index) => {
      if (index < bodyStart) {
        return '';
      }
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return '';
      }
      return inFence ? '' : line;
    })
    .join('\n');
}

// region | Helpers

/**
 * Reports the index of the first body line, skipping a leading frontmatter block. A block is recognized only when the
 * first line is exactly `---` and a later `---` closes it, so a body opening on a thematic break is left alone. An
 * unterminated block counts as body too: scanning a malformed file is the safe direction, where blanking it to the
 * end would skip the check entirely.
 */
function findBodyStart(lines: ReadonlyArray<string>): number {
  if (lines[0] !== '---') {
    return 0;
  }
  const closingIndex = lines.indexOf('---', 1);
  return closingIndex === -1 ? 0 : closingIndex + 1;
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
