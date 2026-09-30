/**
 * Idempotent management of sentinel blocks within a host document (e.g. a repo-root `AGENTS.md`). Each block owns a
 * region delimited by `<!-- <kind>:<name> -->` / `<!-- /<kind>:<name> -->` markers, so a rulebook block and a
 * reference block of the same name are distinct. Every function is a pure string transform without filesystem access.
 */

import { renderRulebookVersionLines } from './rulebook-version-line.ts';

/** What a sentinel block delivers, named in its markers. */
export type SentinelBlockKind = 'reference' | 'rulebook';

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

/** Inserts or replaces the rulebook block for `slug`, as `injectSentinelBlock` does. */
export function injectRulebook(content: string, slug: string, body: string, version?: string): string {
  return injectSentinelBlock(content, 'rulebook', slug, renderRulebookInner(body, version));
}

/**
 * Inserts or replaces the sentinel block of `kind` for `name`, with `inner` as written between its markers. An existing
 * block is replaced in place; otherwise the block is appended, separated from preceding content by a single blank
 * line. Re-inserting an identical block yields a byte-identical document, which keeps `sync` diff-free on re-run.
 */
export function injectSentinelBlock(content: string, kind: SentinelBlockKind, name: string, inner: string): string {
  const block = renderSentinelBlock(kind, name, inner);
  const existing = blockPattern(kind, name);

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
  if (!blockPattern('rulebook', slug).test(content)) {
    return content;
  }

  const block = blockSource('rulebook', slug);
  const withLeadingSeparator = new RegExp(String.raw`\n\n${block}`);
  if (withLeadingSeparator.test(content)) {
    return content.replace(withLeadingSeparator, '');
  }

  const atStart = new RegExp(String.raw`^${block}\n*`);
  if (atStart.test(content)) {
    return content.replace(atStart, '');
  }

  return content.replace(new RegExp(block), '');
}

/**
 * Renders the canonical block for a slug: open marker, the version line when the rulebook declares one, trimmed
 * body, close marker.
 */
export function renderRulebookBlock(slug: string, body: string, version?: string): string {
  return renderSentinelBlock('rulebook', slug, renderRulebookInner(body, version));
}

/** Renders the canonical block of `kind` for `name`: open marker, `inner` as written, close marker. */
export function renderSentinelBlock(kind: SentinelBlockKind, name: string, inner: string): string {
  return [openMarker(kind, name), inner, closeMarker(kind, name)].join('\n');
}

// region | Helpers

/** Regex source matching a block's full extent (markers inclusive, body matched lazily). */
function blockSource(kind: SentinelBlockKind, name: string): string {
  return String.raw`${escapeRegExp(openMarker(kind, name))}[\s\S]*?${escapeRegExp(closeMarker(kind, name))}`;
}

/** A non-global RegExp matching a block's full extent. */
function blockPattern(kind: SentinelBlockKind, name: string): RegExp {
  return new RegExp(blockSource(kind, name));
}

/** Closing marker of a sentinel block. */
function closeMarker(kind: SentinelBlockKind, name: string): string {
  return `<!-- /${kind}:${name} -->`;
}

/** Escapes a string for literal use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** Opening marker of a sentinel block. */
function openMarker(kind: SentinelBlockKind, name: string): string {
  return `<!-- ${kind}:${name} -->`;
}

/** Renders a rulebook block's content: the version line when the rulebook declares one, then the trimmed body. */
function renderRulebookInner(body: string, version?: string): string {
  return [...renderRulebookVersionLines(version), body.trim()].join('\n');
}

// endregion | Helpers
