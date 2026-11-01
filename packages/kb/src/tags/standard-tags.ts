/** A tag that every store shares, with the one-line meaning that every skill applies it by. */
export interface StandardTag {
  tag: string;
  meaning: string;
}

/**
 * The disposition tags that every store inherits, sorted by tag. A store is never required to use one, and it can
 * alias its own spelling to one through `.kb/tag-aliases.yaml`.
 */
export const STANDARD_TAGS: readonly StandardTag[] = [
  { tag: 'deferred', meaning: 'Reviewed and set aside, to surface again later rather than act on now.' },
  { tag: 'obsolete', meaning: 'Valid when recorded, but no longer applies.' },
  { tag: 'rejected', meaning: 'Judged incorrect, or declined.' },
];
