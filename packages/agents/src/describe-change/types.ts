import type { ChangeRecord } from '../change-grammar/types.ts';
import type { ChangeRecordBlock } from './change-record-block.ts';
import type { MergeOverrides } from './resolve-merge.ts';

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

/** What a branch of commits consolidated to, in the shape the JSON output names. */
export interface ConsolidateBranchOutcome {
  entries: ClassifiedEntryOutcome[];
  head: HeadOutcome | null;
  unclassified: Array<{ commit: string; subject: string }>;
  violations: Array<{ commit: string; policy: string; type: string }>;
}

/** A head, in the shape the JSON output names: the scope, type, and breaking marker of a change, and no title. */
export interface HeadOutcome {
  breaking: boolean;
  scope: string | null;
  type: string | null;
}

/** What the invocation asks for: the subcommand it names, and what that subcommand reads from its arguments. */
export type ParsedArgs =
  | { baseRef: string; subcommand: 'consolidate-branch' }
  | { block: ChangeRecordBlock; subcommand: 'render-block' }
  | { merge: ResolveMergeArgs; subcommand: 'resolve-merge' }
  | { record: ChangeRecord; subcommand: 'render-titles' }
  | { subcommand: 'parse-title'; subject: string; surface: Surface }
  | { subcommand: 'resolve-ticket-type'; ticketLabels: string[] };

/** A subject read back through a surface's template, or the report that the template did not match it. */
export type ParseTitleOutcome =
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
export interface RenderBlockOutcome {
  block: string;
}

/** The rendered title for each surface, under the `<surface>_title` key the JSON output names. */
export type RenderedTitles = Record<`${Surface}_title`, string>;

/** The pull request that `resolve-merge` reads, and the overrides that the author applies to it. */
export interface ResolveMergeArgs {
  baseRef: string;
  headCommit: string;
  overrides: MergeOverrides;
  prBodyFile: string;
  prLabels: string[];
  prNumber: string;
  prTitle: string;
  /** The ticket reference that applies where the pull-request title carries none. */
  ticketRef?: string;
}

/** One subcommand of the helper. */
export type Subcommand = ParsedArgs['subcommand'];

/** One surface a title template is configured for. */
export type Surface = (typeof SURFACES)[number];

/** The surfaces a title is configured for, in the order the rendered output names them. */
export const SURFACES = ['commit', 'ticket', 'pr', 'merge'] as const;

/** The work type that a ticket's labels name, under the key the JSON output names. */
export interface TicketTypeOutcome {
  ticket_type: string | null;
}

// region | Helpers

/** The surface names widened to strings, so a membership test accepts an arbitrary one. */
const SURFACE_NAMES: readonly string[] = SURFACES;

// endregion | Helpers
