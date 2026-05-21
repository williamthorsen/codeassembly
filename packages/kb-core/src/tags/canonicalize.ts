import type { AliasMap } from '../types.ts';

// Tag-resolution primitives. Both functions take positional arguments rather than a single options object — a
// documented exception to the package's object-input convention, because they are called in tight per-tag loops.

/**
 * Returns the canonical form of a tag. Lookups are case-insensitive.
 * Unknown tags and tags that are already canonical pass through unchanged.
 */
export function canonicalize(tag: string, aliases: AliasMap): string {
  return aliases.get(tag.toLowerCase()) ?? tag;
}

/**
 * Returns the canonical form of a tag only when the input is a known alias; otherwise `null`.
 * Distinguishes drift (an alias is present) from canonical or new-vocabulary tags.
 */
export function findAliasFor(tag: string, aliases: AliasMap): string | null {
  return aliases.get(tag.toLowerCase()) ?? null;
}
