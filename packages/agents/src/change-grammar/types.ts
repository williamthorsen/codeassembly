/** Whether a work type requires, admits, or forbids the breaking marker. */
export type BreakingPolicy = 'forbidden' | 'optional' | 'required';

/**
 * The values a surface template renders from, and the values a parse returns. Every field is optional: a template
 * names only the tokens its convention carries, and a field the record omits resolves to empty.
 */
export interface ChangeRecord {
  breaking?: boolean;
  prNumber?: string;
  scope?: string;
  ticketRef?: string;
  title?: string;
  type?: string;
}

/**
 * The work-type taxonomy the engine is given rather than reads. `tiers` and the order of `types` together rank the
 * entries, so a caller supplying the taxonomy also supplies the ranking.
 */
export interface Taxonomy {
  tiers: readonly string[];
  types: readonly WorkTypeEntry[];
}

/** One work type as the taxonomy declares it. */
export interface WorkTypeEntry {
  aliases?: readonly string[];
  breakingPolicy?: BreakingPolicy;
  key: string;
  tier: string;
}
