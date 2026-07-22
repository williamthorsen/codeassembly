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
