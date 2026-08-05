import { z } from 'zod';

import { ASSERTIONS_DIR, ASSERTIONS_SEGMENT, CONTENT_DIR } from '../layout/index.ts';

/**
 * Describes why a domain key cannot be used, or returns `undefined` when the key is well-formed. Keys are relative to
 * the assertions root, so a restated `content/assertions/` prefix would declare the domain a level deeper than the
 * author meant; `kb-add` refuses the same mistake on the note-write path.
 */
export function describeKeyDefect(key: string): string | undefined {
  if (key === '') {
    return 'is empty';
  }
  if (key.includes('\\')) {
    return 'contains a backslash; domain paths are slash-separated';
  }
  if (key.startsWith('/') || key.endsWith('/')) {
    return 'has a leading or trailing slash';
  }

  const segments = key.split('/');
  if (segments.some((segment) => segment.trim() === '')) {
    return 'has an empty segment';
  }
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return 'has a "." or ".." segment';
  }
  if (segments[0] === ASSERTIONS_SEGMENT || (segments[0] === CONTENT_DIR && segments[1] === ASSERTIONS_SEGMENT)) {
    return `restates the ${ASSERTIONS_DIR}/ prefix, which every key implies`;
  }
  return undefined;
}

/** A knowledge base's declared assertion structure, keyed by assertions-root-relative slash-path. */
export type Taxonomy = ReadonlyMap<string, TaxonomyEntry>;

/** A single declared domain. */
export interface TaxonomyEntry {
  /** The domain's one-line description; empty when it was declared without one. */
  description: string;
  /** Whether the domain was declared under `provisional:` rather than `domains:`. */
  provisional: boolean;
}

/**
 * The on-disk `.kb/taxonomy.yaml` shape. Both blocks are optional so a file may declare only one, and a description may
 * be null so a key written bare (`engineering/tooling:`) loads rather than failing: that is what a hand editor types
 * and what a back-filled entry round-trips to.
 */
export const taxonomyFileShape = z.object({
  domains: z.record(z.string(), z.string().nullable()).optional(),
  provisional: z.record(z.string(), z.string().nullable()).optional(),
});
