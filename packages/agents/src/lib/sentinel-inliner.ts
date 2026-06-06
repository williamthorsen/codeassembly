/**
 * Idempotent management of per-rulebook sentinel blocks within a host document (e.g. `.agents/PROJECT.md`).
 * Each rulebook owns a region delimited by `<!-- rulebook:<slug> -->` / `<!-- /rulebook:<slug> -->` markers.
 * Every function is a pure string transform with no filesystem access.
 */

function openMarker(slug: string): string {
  return `<!-- rulebook:${slug} -->`;
}

function closeMarker(slug: string): string {
  return `<!-- /rulebook:${slug} -->`;
}

/**
 * Inserts or replaces the sentinel block for `slug`. An existing block is replaced in place; otherwise the
 * block is appended, separated from preceding content by a single blank line. Re-inserting an identical slug
 * and body yields a byte-identical document, which is what keeps `sync` diff-free on re-run.
 */
export function injectRulebook(content: string, slug: string, body: string): string {
  const block = renderBlock(slug, body);
  const existing = blockPattern(slug);

  if (existing.test(content)) {
    // Replace via a function to avoid `$`-sequences in the body being interpreted as replacement patterns.
    return content.replace(existing, () => block);
  }

  if (content === '') {
    return `${block}\n`;
  }

  const base = content.replace(/\n+$/, '');
  return `${base}\n\n${block}\n`;
}

/**
 * Removes the sentinel block for `slug` together with the blank-line separator that precedes it, leaving the
 * surrounding document clean. Returns the content unchanged when the slug is not present.
 */
export function removeRulebook(content: string, slug: string): string {
  if (!blockPattern(slug).test(content)) {
    return content;
  }

  const block = blockSource(slug);
  const withLeadingSeparator = new RegExp(String.raw`\n\n${block}`);
  if (withLeadingSeparator.test(content)) {
    return content.replace(withLeadingSeparator, '');
  }

  const atStart = new RegExp(String.raw`^${block}\n?`);
  if (atStart.test(content)) {
    return content.replace(atStart, '');
  }

  return content.replace(new RegExp(block), '');
}

/** Returns the slugs whose blocks have a complete open/close marker pair, in document order. */
export function extractInstalledSlugs(content: string): ReadonlyArray<string> {
  const pattern = /<!-- rulebook:([a-z0-9-]+) -->[\s\S]*?<!-- \/rulebook:\1 -->/g;
  const slugs: Array<string> = [];
  for (const match of content.matchAll(pattern)) {
    const slug = match[1];
    if (slug !== undefined) {
      slugs.push(slug);
    }
  }
  return slugs;
}

/** Renders the canonical block for a slug: open marker, trimmed body, close marker. */
function renderBlock(slug: string, body: string): string {
  return `${openMarker(slug)}\n${body.trim()}\n${closeMarker(slug)}`;
}

/** Regex source matching a slug's full block (markers inclusive, body matched lazily). */
function blockSource(slug: string): string {
  return String.raw`${escapeRegExp(openMarker(slug))}[\s\S]*?${escapeRegExp(closeMarker(slug))}`;
}

/** A non-global RegExp matching a slug's full block. */
function blockPattern(slug: string): RegExp {
  return new RegExp(blockSource(slug));
}

/** Escapes a string for literal use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
