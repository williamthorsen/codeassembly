/**
 * Idempotent management of the codeassembly-owned ambient region within a harness guidance file (e.g.
 * `~/.claude/CLAUDE.md`). The region is delimited by `<!-- codeassembly-ambient:start -->` /
 * `<!-- codeassembly-ambient:end -->` markers. Its location is `install`'s authority (the guidance templates carry an
 * empty region); its content is `sync`'s (regenerated wholesale from the resolved ambient rulebooks on each run).
 * Every function is a pure string transform with no filesystem access.
 */

export const AMBIENT_OPEN_MARKER = '<!-- codeassembly-ambient:start -->';
export const AMBIENT_CLOSE_MARKER = '<!-- codeassembly-ambient:end -->';

const REGION_PATTERN = /^<!-- codeassembly-ambient:start -->\n([\s\S]*?)^<!-- codeassembly-ambient:end -->[ \t]*$/m;

// Anchored like `REGION_PATTERN`, so a marker these match is one that could take part in a region match, while a
// mention inside prose (indented, or inline) is not mistaken for one.
const OPEN_MARKER_LINE = /^<!-- codeassembly-ambient:start -->$/m;
const CLOSE_MARKER_LINE = /^<!-- codeassembly-ambient:end -->[ \t]*$/m;

/**
 * Appends a region carrying `body` to `content`, separated from any existing text by a blank line. Content that is
 * blank yields the region alone. For a host `sync` owns but did not necessarily create, this is what adds the region
 * without disturbing what the user wrote above it.
 */
export function appendAmbientRegion(content: string, body: string): string {
  const region = `${renderRegion(body)}\n`;
  return content.trim() === '' ? region : `${content.replace(/\n*$/, '\n')}\n${region}`;
}

/**
 * Returns the region's inner content with no surrounding newlines (an empty string for an empty region), or
 * `undefined` when no complete marker pair is present.
 */
export function extractAmbientRegionContent(content: string): string | undefined {
  const match = REGION_PATTERN.exec(content);
  if (match === null) {
    return undefined;
  }
  return (match[1] ?? '').replace(/\n+$/, '');
}

/** True when the content holds a complete ambient region marker pair. */
export function hasAmbientRegion(content: string): boolean {
  return REGION_PATTERN.test(content);
}

/**
 * True when the content carries a region marker but no complete pair — a half-written or hand-broken region. Appending
 * a fresh region to such content would leave two open markers, and the next injection would then match from the
 * earlier one through the new region's close marker, replacing everything the user wrote in between. Callers that
 * create regions must reject this state rather than append to it.
 */
export function hasIncompleteAmbientRegion(content: string): boolean {
  if (hasAmbientRegion(content)) {
    return false;
  }
  return OPEN_MARKER_LINE.test(content) || CLOSE_MARKER_LINE.test(content);
}

/**
 * Replaces the ambient region's content with `body`, keeping the markers. Throws when no complete region is present:
 * the region's location belongs to the rendered guidance file, so a missing region means `install` has not rendered
 * one and the caller should surface that rather than invent a location. Re-injecting an identical body yields
 * byte-identical content, which is what keeps `sync` diff-free on re-run.
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

/** Wraps `body` in the region markers, with no surrounding newlines; an empty body yields adjacent marker lines. */
function renderRegion(body: string): string {
  const trimmed = body.replace(/\n+$/, '');
  return trimmed === ''
    ? `${AMBIENT_OPEN_MARKER}\n${AMBIENT_CLOSE_MARKER}`
    : `${AMBIENT_OPEN_MARKER}\n${trimmed}\n${AMBIENT_CLOSE_MARKER}`;
}

// endregion | Helpers
