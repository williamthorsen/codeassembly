import type { ChangeRecord } from '../change-grammar/types.ts';

/** Reports whether `value` names one of the configured surfaces. */
export function isSurface(value: string): value is Surface {
  return SURFACE_NAMES.includes(value);
}

/** One entry the classification found, flattened onto the commit that declared it. */
export interface ClassifiedEntryOutcome {
  breaking: boolean;
  commit: string;
  scope: string | null;
  title: string | null;
  type: string | null;
}

/** What a branch of commits classified to, in the shape the JSON output names. */
export interface ClassifyOutcome {
  entries: ClassifiedEntryOutcome[];
  head: HeadOutcome | null;
  ticket_type: string | null;
  unclassified: Array<{ commit: string; subject: string }>;
  violations: Array<{ commit: string; policy: string; type: string }>;
}

/** The head a branch's entries consolidated to. It names no title; a caller supplies that from the change summary. */
export interface HeadOutcome {
  breaking: boolean;
  scope: string | null;
  type: string | null;
}

/**
 * What the invocation asks for: titles rendered from a record, one surface's subject read back into a record, or a
 * commit range classified.
 */
export type ParsedArgs =
  | { baseRef: string; mode: 'classify'; ticketLabels: string[] }
  | { mode: 'parse'; subject: string; surface: Surface }
  | { mode: 'render'; record: ChangeRecord };

/** A subject read back through a surface's template, or the report that the template did not match it. */
export type ParseOutcome =
  | { matched: false }
  | {
      breaking: boolean;
      matched: true;
      pr_number: string | null;
      scope: string | null;
      ticket_ref: string | null;
      title: string | null;
      type: string | null;
    };

/** The rendered title for each surface, under the `<surface>_title` key the JSON output names. */
export type RenderedTitles = Record<`${Surface}_title`, string>;

/** One surface a title template is configured for. */
export type Surface = (typeof SURFACES)[number];

/** The surfaces a title is configured for, in the order the rendered output names them. */
export const SURFACES = ['commit', 'ticket', 'pr', 'merge'] as const;

// region | Helpers

/** The surface names widened to strings, so a membership test accepts an arbitrary one. */
const SURFACE_NAMES: readonly string[] = SURFACES;

// endregion | Helpers
