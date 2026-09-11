import type { ChangeRecord } from '../change-grammar/types.ts';
import type { ChangeRecordBlock } from './change-record-block.ts';

/** Reports whether `value` names one of the configured surfaces. */
export function isSurface(value: string): value is Surface {
  return SURFACE_NAMES.includes(value);
}

/**
 * One entry the classification found, flattened onto the commit that declared it. `change` is the entry rendered back
 * through `commit.title_format`, the form a `Change:` trailer takes.
 */
export interface ClassifiedEntryOutcome {
  breaking: boolean;
  change: string;
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
 * What the invocation asks for: titles rendered from a record, one surface's subject read back into a record, a commit
 * range classified, or a `change-record` block rendered.
 */
export type ParsedArgs =
  | { baseRef: string; mode: 'classify'; ticketLabels: string[] }
  | { block: ChangeRecordBlock; mode: 'record-block' }
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

/** The fenced `change-record` block, under the key the JSON output names. */
export interface RecordBlockOutcome {
  block: string;
}

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
