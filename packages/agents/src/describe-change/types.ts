import type { ChangeRecord } from '../change-grammar/types.ts';
import type { ChangeRecordBlock, RecordOverrides } from './change-record-block.ts';
import type { RecordDefect } from './find-defects.ts';
import type { MergeOverrides } from './resolve-merge.ts';

/** Reports whether `value` names one of the configured surfaces. */
export function isSurface(value: string): value is Surface {
  return SURFACE_NAMES.includes(value);
}

/** What a branch of commits consolidated to, in the shape that the JSON output names. */
export interface ConsolidateBranchOutcome {
  entries: EntryOutcome[];
  consolidated_record: ConsolidatedRecordOutcome;
  unmatched: Array<{ commit: string; subject: string }>;
  violations: Array<{ commit: string; policy: string; type: string }>;
}

/** A merge body that passed the check, reporting the entry count that its block records. */
export interface CheckMergeBodyOutcome {
  entry_count: number;
}

/**
 * A consolidated record, in the shape that the JSON output names: the scope, type, and breaking marker of a branch,
 * each `null` when the branch has no entries to determine it.
 */
export interface ConsolidatedRecordOutcome {
  breaking: boolean | null;
  scope: string | null;
  type: string | null;
}

/** What a change's entries consolidated to, in the shape that the JSON output names. */
export interface ConsolidateEntriesOutcome {
  consolidated_record: ConsolidatedRecordOutcome;
}

/** An effective record, in the shape that the JSON output names: every field of a record, each `null` when nothing sets it. */
export interface EffectiveRecordOutcome {
  breaking: boolean;
  pr_number: string | null;
  scope: string | null;
  ticket_ref: string | null;
  title: string | null;
  type: string | null;
}

/**
 * One entry of a branch, flattened onto the commit that declared it. `change` is the entry rendered back through
 * `commit.title_format`, the form that a `Change:` trailer takes.
 */
export interface EntryOutcome {
  breaking: boolean;
  change: string;
  commit: string;
  scope: string | null;
  title: string | null;
  type: string | null;
}

/** What the invocation asks for: the subcommand that it names, and what that subcommand reads from its arguments. */
export type ParsedArgs =
  | { baseRef: string; subcommand: 'consolidate-branch' }
  | { bodyFile: string; entryCount: number; subcommand: 'check-merge-body' }
  | { bodyFile: string; record: ChangeRecord; subcommand: 'resolve-labels' }
  | { block: ChangeRecordBlock; entriesFile?: string; subcommand: 'render-block' }
  | { entriesFile: string; subcommand: 'consolidate-entries' }
  | { merge: ResolveMergeArgs; subcommand: 'resolve-merge' }
  | { overrides: RecordOverrides; record: ChangeRecord; subcommand: 'resolve-effective-record' }
  | { paths: string[]; subcommand: 'resolve-scopes' }
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

/** The fenced `change-record` block, under the key that the JSON output names. */
export interface RenderBlockOutcome {
  block: string;
}

/** The rendered title for each surface, under the `<surface>_title` key that the JSON output names. */
export type RenderedTitles = Record<`${Surface}_title`, string>;

/** The effective record and the defects that block its approval, under the keys that the JSON output names. */
export interface ResolveEffectiveRecordOutcome {
  effective_record: EffectiveRecordOutcome;
  defects: RecordDefect[];
}

/** The pull request that `resolve-merge` reads, and the overrides that the author applies to it. */
export interface ResolveMergeArgs {
  baseRef: string;
  headCommit: string;
  overrides: MergeOverrides;
  prBodyFile: string;
  prLabels: string[];
  prNumber: string;
  prTitle: string;
  /** The ticket reference to be used when the pull-request title does not contain one. */
  ticketRef?: string;
}

/** The labels for a change, under the key that the JSON output names. */
export interface ResolveLabelsOutcome {
  labels: string[];
}

/** Every given path's scope and the union of those scopes, under the keys that the JSON output names. */
export interface ResolveScopesOutcome {
  path_scopes: Record<string, string>;
  scopes: string[];
}

/** One subcommand of the helper. */
export type Subcommand = ParsedArgs['subcommand'];

/** One surface for which a title template is configured. */
export type Surface = (typeof SURFACES)[number];

/** The surfaces for which a title is configured, in the order the rendered output names them. */
export const SURFACES = ['commit', 'ticket', 'pr', 'merge'] as const;

/** The work type that a ticket's labels name, under the key that the JSON output names. */
export interface TicketTypeOutcome {
  ticket_type: string | null;
}

// region | Helpers

/** The surface names widened to strings, so a membership test accepts an arbitrary one. */
const SURFACE_NAMES: readonly string[] = SURFACES;

// endregion | Helpers
