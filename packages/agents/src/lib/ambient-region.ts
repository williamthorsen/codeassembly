/**
 * Idempotent management of the codeassembly-owned ambient region within a harness guidance file (e.g.
 * `~/.claude/CLAUDE.md`). The region is delimited by `<!-- codeassembly-ambient:start -->` /
 * `<!-- codeassembly-ambient:end -->` markers. Its location is `install`'s authority (the guidance templates carry an
 * empty region); its content is `sync`'s (regenerated wholesale from the resolved ambient rulebooks on each run).
 * Every function is a pure string transform with no filesystem access.
 *
 * A host carries at most one region, and every transform here depends on it. `REGION_PATTERN` is anchored and lazy,
 * so on content holding a stray marker above a well-formed region it matches from the stray marker through the
 * region's close marker: replacing that match discards every line between them. `classifyAmbientRegion` is the one
 * place that invariant is checked, and `hasAmbientRegion` is defined in terms of it so no transform can run on
 * content that violates it.
 */

export const AMBIENT_OPEN_MARKER = '<!-- codeassembly-ambient:start -->';
export const AMBIENT_CLOSE_MARKER = '<!-- codeassembly-ambient:end -->';

/** How a host's ambient region stands: no markers at all, exactly one well-formed region, or anything else. */
export type AmbientRegionState = 'absent' | 'complete' | 'malformed';

const REGION_PATTERN = /^<!-- codeassembly-ambient:start -->\n([\s\S]*?)^<!-- codeassembly-ambient:end -->[ \t]*$/m;

// Anchored like `REGION_PATTERN`, so a marker these match is one that could take part in a region match, while a
// mention inside prose (indented, or inline) is not mistaken for one.
const OPEN_MARKER_LINE = /^<!-- codeassembly-ambient:start -->$/gm;
const CLOSE_MARKER_LINE = /^<!-- codeassembly-ambient:end -->[ \t]*$/gm;

/**
 * Appends a region carrying `body` to `content`, separated from any existing text by a blank line. Content that is
 * blank yields the region alone. For a host `sync` owns but did not necessarily create, this is what adds the region
 * without disturbing what the user wrote above it. The caller must have established that `content` carries no region
 * — appending to content that already holds one produces a malformed host.
 */
export function appendAmbientRegion(content: string, body: string): string {
  const region = `${renderRegion(body)}\n`;
  return content.trim() === '' ? region : `${content.replace(/\n*$/, '\n')}\n${region}`;
}

/**
 * Reports whether `content` holds no markers, exactly one well-formed region, or a region no transform may touch.
 * Malformed covers an unmatched marker, a close marker preceding its open, and any duplication — two regions, or a
 * stray marker beside a well-formed one. Each of those either destroys text on the next injection or leaves a second
 * region permanently stale, so they are one category: the caller must repair the host rather than write to it.
 */
export function classifyAmbientRegion(content: string): AmbientRegionState {
  const openCount = countMatches(content, OPEN_MARKER_LINE);
  const closeCount = countMatches(content, CLOSE_MARKER_LINE);
  if (openCount === 0 && closeCount === 0) {
    return 'absent';
  }
  return openCount === 1 && closeCount === 1 && REGION_PATTERN.test(content) ? 'complete' : 'malformed';
}

/**
 * Returns the region's inner content with no surrounding newlines (an empty string for an empty region), or
 * `undefined` unless exactly one well-formed region is present. A damaged host yields `undefined` rather than the
 * widened span `REGION_PATTERN` matches there, so a caller preserving region content across a re-render cannot carry
 * text the region does not own back into it.
 */
export function extractAmbientRegionContent(content: string): string | undefined {
  const match = hasAmbientRegion(content) ? REGION_PATTERN.exec(content) : null;
  if (match === null) {
    return undefined;
  }
  return (match[1] ?? '').replace(/\n+$/, '');
}

/** True when the content holds exactly one well-formed ambient region. */
export function hasAmbientRegion(content: string): boolean {
  return classifyAmbientRegion(content) === 'complete';
}

/**
 * Replaces the ambient region's content with `body`, keeping the markers. Throws unless exactly one well-formed
 * region is present: a missing region means `install` has not rendered one and the caller should surface that rather
 * than invent a location, and a malformed one means the replacement span reaches text the region does not own.
 * Re-injecting an identical body yields byte-identical content, which is what keeps `sync` diff-free on re-run.
 */
export function injectAmbientRegion(content: string, body: string): string {
  if (!hasAmbientRegion(content)) {
    throw new Error(
      'No ambient region found to inject into; the guidance file carries the region only once `install` has rendered it.',
    );
  }
  // Replace via a function so `$`-sequences in the body are not treated as replacement patterns.
  return content.replace(REGION_PATTERN, () => renderRegion(body));
}

/**
 * Empties the ambient region's content, keeping the markers, so hashes computed over the result are insensitive to
 * what `sync` wrote there. Content without a complete region is returned unchanged.
 */
export function stripAmbientRegionContent(content: string): string {
  if (!hasAmbientRegion(content)) {
    return content;
  }
  return content.replace(REGION_PATTERN, () => renderRegion(''));
}

// region | Helpers

/** Counts the anchored marker lines `pattern` matches. `pattern` must be global, so the count covers the whole host. */
function countMatches(content: string, pattern: RegExp): number {
  return (content.match(pattern) ?? []).length;
}

/** Wraps `body` in the region markers, with no surrounding newlines; an empty body yields adjacent marker lines. */
function renderRegion(body: string): string {
  const trimmed = body.replace(/\n+$/, '');
  return trimmed === ''
    ? `${AMBIENT_OPEN_MARKER}\n${AMBIENT_CLOSE_MARKER}`
    : `${AMBIENT_OPEN_MARKER}\n${trimmed}\n${AMBIENT_CLOSE_MARKER}`;
}

// endregion | Helpers
