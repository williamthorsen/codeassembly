// Shapes for the select-lede-exemplars helper: the exemplars it emits and how far it reached to find them.

/** One author-approved lede, with the change identity a drafter calibrates a new lede against. */
export interface LedeExemplar {
  /** The approved text: the record's merged lede when it carries one, its agent lede otherwise. */
  lede: string;
  /** Canonical work-type key, so a record filed under an alias and one filed under the key read alike. */
  type: string;
  tier: string;
  scope: string;
  /** Number of the pull request the lede shipped with. */
  pr: string;
  capturedAt: string;
}

/**
 * How far selection reached past the requested type: `none` drew on that type alone, `tier` also drew on its
 * tier-mates, and `any` also drew on types of other tiers.
 */
export type Widening = 'none' | 'tier' | 'any';

/** The selection core's outcome: the exemplars newest first, the widening that ran, and the records it could not read. */
export interface ExemplarSelection {
  exemplars: LedeExemplar[];
  widening: Widening;
  /** One line per decision record that could not be read as an exemplar; a malformed record never fails the run. */
  warnings: string[];
}
