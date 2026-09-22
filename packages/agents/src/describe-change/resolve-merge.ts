import { applyOverrides, type Overrides } from '../change-grammar/apply-overrides.ts';
import { compileTemplate } from '../change-grammar/compile-template.ts';
import { parse } from '../change-grammar/parse.ts';
import { render } from '../change-grammar/render.ts';
import { SCOPE_SEPARATOR } from '../change-grammar/tokens.ts';
import type { ChangeRecord, Taxonomy } from '../change-grammar/types.ts';
import { extractSection } from '../lib/markdown-sections.ts';
import type { ChangeEntry } from './change-entries.ts';
import {
  type ChangeRecordBlock,
  type ChangeRecordBlockReading,
  type RecordOverrides,
  stripChangeRecordBlocks,
} from './change-record-block.ts';
import { findDefects, type RecordDefect } from './find-defects.ts';
import type { ConsolidatedRecordOutcome, EffectiveRecordOutcome, Surface } from './types.ts';

/**
 * Resolves what a pull request merges as: the effective record and the source of each of its fields, the merge title and
 * body, what each source names, the defects that block approval, and the notices that the approval gate shows.
 *
 * A readable block resolves the base record through `chooseFromBlock` and its absence through `chooseFromLabels`, each
 * of which states how it weighs the commits. The block's overrides then apply, and the caller's apply last, through
 * `applyOverrides`, so each field is attributed to the source that set it last. The title resolves on a precedence of
 * its own.
 *
 * A block whose entries were derived at the pull request's head is fresh, and its consolidated record stands over the
 * commits'. A stale block, a block written before the entries entered the grammar, and one whose entries are absent all
 * keep the rule that the commits win, as the fresher of two consolidations of the same branch.
 */
export function resolveMerge(input: MergeInput): ResolveMergeOutcome {
  const { block, entriesFresh, notices } = readSources(input);
  const commits = input.commits.kind === 'read' ? readCommitsRecord(input.commits.consolidatedRecord) : undefined;
  const base =
    block === undefined
      ? chooseFromLabels({ commits, labels: input.labels, notices })
      : applySourcedOverrides(
          chooseFromBlock({ block, commits, entriesFresh, notices }),
          block.overrides ?? {},
          'block_overrides',
        );
  const { record: effective, sources } = applySourcedOverrides(base, input.overrides, 'flags');

  const prTitle = readPullRequestTitle(input);
  notices.push(...findPullRequestTitleNotices(prTitle, effective));
  const title = resolveTitle({ blockTitle: block?.title, overrides: input.overrides, pr: input.pr, prTitle });
  const ticketRef = resolveTicketRef({ prTitle, ticketRef: input.ticketRef });

  return {
    effective_record: {
      title: title.value,
      scope: effective.scope ?? null,
      type: effective.type ?? null,
      breaking: effective.breaking === true,
      ticket_ref: ticketRef?.value ?? null,
      pr_number: input.pr.number,
    },
    effective_sources: {
      title: title.source,
      scope: sources.scope,
      type: sources.type,
      breaking: sources.breaking,
      ticket_ref: ticketRef?.source ?? null,
    },
    merge_title: renderMergeTitle({
      effective,
      prNumber: input.pr.number,
      template: input.templates.merge,
      ticketRef: ticketRef?.value,
      title: title.value,
    }),
    body: composeBody(input.pr.body),
    trailers: renderEntryTrailers(block?.entries ?? [], input.templates.commit),
    sources: {
      block: block === undefined ? null : toBlockOutcome(block),
      commits: commits === undefined ? null : toSourceRecordOutcome(commits),
      labels: toSourceRecordOutcome(input.labels),
      pr_title: prTitle === undefined ? null : toPullRequestTitleOutcome(prTitle),
    },
    defects: findDefects(effective, input.taxonomy),
    notices,
  };
}

/**
 * The block as read, in the shape that the JSON output names: `consolidated_record` is `null` when the block has none,
 * `entries` is empty when the block records none or when they were malformed, and `entries_commit` is the short SHA
 * that the block recorded.
 */
export interface BlockOutcome {
  consolidated_record: { breaking: boolean; scope: string | null; type: string | null } | null;
  entries: ChangeEntry[];
  entries_commit: string | null;
  overrides: RecordOverrides;
  title: string;
}

/** A field of a consolidated record, on which two sources are compared. */
export type ComparedField = 'breaking' | 'scope' | 'type';

/** What supplied a field of the effective record. `flags` names the invocation's overrides and its `--ticket-ref`. */
export type EffectiveSource =
  'block' | 'block_overrides' | 'commits' | 'flags' | 'labels' | 'pr_title' | 'pr_title_verbatim';

/** The source of each field of the effective record, each `null` when nothing supplied it. */
export interface EffectiveSourcesOutcome {
  breaking: EffectiveSource | null;
  scope: EffectiveSource | null;
  ticket_ref: EffectiveSource | null;
  title: EffectiveSource;
  type: EffectiveSource | null;
}

/** What a merge resolves from. */
export interface MergeInput {
  /** The pull-request body's last `change-record` block, as read. */
  block: ChangeRecordBlockReading;
  /**
   * The record to which the pull request's commits consolidate, absent when they have no entry, or the reason that the
   * commits could not be read.
   */
  commits: { consolidatedRecord?: ChangeRecord; kind: 'read' } | { kind: 'unavailable'; reason: string };
  /** The record that the pull request's labels name, as `resolveLabeledRecord` resolves it. */
  labels: ChangeRecord;
  overrides: MergeOverrides;
  pr: { body: string; headCommit: string; number: string; title: string };
  taxonomy: Taxonomy;
  templates: Record<Surface, string>;
  /** The ticket reference to be used when the pull-request title does not contain one. */
  ticketRef?: string;
}

/** Something the approval gate shows the author without blocking approval. */
export type MergeNotice =
  | { kind: 'absent-block' }
  | { kind: 'commits-unavailable'; reason: string }
  | { fields: ComparedField[]; kind: 'divergence'; sources: ['block' | 'labels', 'commits'] }
  | { defect: string; kind: 'malformed-block' }
  | { defect: string; kind: 'malformed-entries' }
  | { fields: ComparedField[]; kind: 'pr-title-divergence' }
  | { kind: 'pr-title-unparsed' }
  | { entries_commit: string | null; head_commit: string; kind: 'stale-entries' };

/** The author's overrides, each outranking every other source for its own field. */
export interface MergeOverrides extends Overrides {
  title?: string;
}

/** What each source names, whether or not the resolution used it, each `null` when the source was not read. */
export interface MergeSourcesOutcome {
  block: BlockOutcome | null;
  commits: ConsolidatedRecordOutcome | null;
  labels: SourceRecordOutcome;
  pr_title: PullRequestTitleOutcome | null;
}

/** The record that the pull-request title contains, in the shape that the JSON output names. */
export interface PullRequestTitleOutcome {
  breaking: boolean | null;
  scope: string | null;
  ticket_ref: string | null;
  title: string;
  type: string | null;
}

/** The resolved merge, in the shape that the JSON output names. */
export interface ResolveMergeOutcome {
  body: string;
  defects: RecordDefect[];
  effective_record: EffectiveRecordOutcome;
  effective_sources: EffectiveSourcesOutcome;
  merge_title: string;
  notices: MergeNotice[];
  sources: MergeSourcesOutcome;
  trailers: string[];
}

/**
 * The scope, type, and breaking marker that a source names, in the shape that the JSON output names, each `null` when
 * the source does not determine it.
 */
export interface SourceRecordOutcome {
  breaking: boolean | null;
  scope: string | null;
  type: string | null;
}

// region | Helpers

/** Applies overrides to a record, attributing each field that they set to `source`. */
function applySourcedOverrides(
  attributed: AttributedRecord,
  overrides: Overrides,
  source: EffectiveSource,
): AttributedRecord {
  return {
    record: applyOverrides(attributed.record, overrides),
    sources: {
      breaking: overrides.breaking === undefined ? attributed.sources.breaking : source,
      scope: overrides.scope === undefined ? attributed.sources.scope : source,
      type: overrides.type === undefined ? attributed.sources.type : source,
    },
  };
}

/**
 * Reports whether the block's entries were derived at the pull request's head: The block records entries, it records
 * the commit at which they were derived, and the head SHA starts with that commit. The comparison is a prefix test
 * rather than an equality, since the block records a short SHA and the pull request reports a full one.
 */
function areEntriesFresh(block: ChangeRecordBlock, headCommit: string): boolean {
  const entriesCommit = block.entriesCommit;
  if (block.entries === undefined || block.entries.length === 0 || entriesCommit === undefined) {
    return false;
  }
  return entriesCommit !== '' && headCommit.toLowerCase().startsWith(entriesCommit.toLowerCase());
}

/** A consolidated record, with each of its fields attributed to the source that set it. */
interface AttributedRecord {
  record: ChangeRecord;
  sources: Record<ComparedField, EffectiveSource | null>;
}

/**
 * Chooses between the block's consolidated record and the commits', reporting the fields on which they disagree
 * whichever of the two stands.
 *
 * Freshness decides. A block whose entries were derived at the pull request's head consolidated from the entries, which
 * the commit subjects only approximate, so its record stands. Otherwise the commits' wins whenever they were read, as
 * the fresher of two consolidations of the same branch, and the block's stands only when the two agree or when the
 * commits could not be read.
 */
function chooseFromBlock(input: {
  block: ChangeRecordBlock;
  commits: ChangeRecord | undefined;
  entriesFresh: boolean;
  notices: MergeNotice[];
}): AttributedRecord {
  const blockRecord = toComparedFields(input.block.consolidatedRecord ?? {});
  const fields = input.commits === undefined ? [] : findDifferingFields(blockRecord, input.commits);
  if (fields.length > 0) {
    input.notices.push({ kind: 'divergence', sources: ['block', 'commits'], fields });
  }
  if (input.commits === undefined || fields.length === 0 || input.entriesFresh) {
    return { record: blockRecord, sources: { breaking: 'block', scope: 'block', type: 'block' } };
  }
  return { record: input.commits, sources: { breaking: 'commits', scope: 'commits', type: 'commits' } };
}

/**
 * Chooses the record without a readable block: the type and its marker from the labels when a type label resolved,
 * otherwise from the commits, and the scope from its label when one resolved, otherwise from the commits.
 */
function chooseFromLabels(input: {
  commits: ChangeRecord | undefined;
  labels: ChangeRecord;
  notices: MergeNotice[];
}): AttributedRecord {
  const commitsSource = input.commits === undefined ? null : 'commits';
  const typed = input.labels.type === undefined ? (input.commits ?? {}) : input.labels;
  const typeSource = input.labels.type === undefined ? commitsSource : 'labels';
  const scope = input.labels.scope ?? input.commits?.scope;
  const record: ChangeRecord = {
    ...(typed.type !== undefined && typed.breaking === true && { breaking: true }),
    ...(scope !== undefined && { scope }),
    ...(typed.type !== undefined && { type: typed.type }),
  };
  if (input.commits !== undefined) {
    const fields = findDifferingFields(record, input.commits);
    if (fields.length > 0) {
      input.notices.push({ kind: 'divergence', sources: ['labels', 'commits'], fields });
    }
  }
  return {
    record,
    sources: {
      breaking: typeSource,
      scope: input.labels.scope === undefined ? commitsSource : 'labels',
      type: typeSource,
    },
  };
}

/** Matches a keyword with which a platform closes the tickets that follow it, with an optional colon. */
const CLOSING_KEYWORD = /^(?:close[ds]?|fix(?:e[ds])?|resolve[ds]?):?$/i;

/** The fields on which two sources are compared, in the order that a notice lists them. */
const COMPARED_FIELDS: readonly ComparedField[] = ['scope', 'type', 'breaking'];

/**
 * Composes the merge body from the pull request's `## What` section, with every `change-record` block removed and the
 * trailing lines that only close a ticket dropped, so neither appears in the merge commit.
 */
function composeBody(body: string): string {
  const section = extractSection({ heading: 'What', text: body.replaceAll('\r\n', '\n') }) ?? '';
  const lines = stripChangeRecordBlocks(section).split('\n');
  while (lines.length > 0 && isDroppedTrailingLine(lines.at(-1) ?? '')) {
    lines.pop();
  }
  return lines.join('\n').trim();
}

/** Lists the fields on which two records disagree, reading an absent marker as not breaking. */
function findDifferingFields(left: ChangeRecord, right: ChangeRecord): ComparedField[] {
  return COMPARED_FIELDS.filter((field) =>
    field === 'breaking' ? (left.breaking === true) !== (right.breaking === true) : left[field] !== right[field],
  );
}

/**
 * Reports a pull-request title that does not invert, or one whose typed prefix differs from the effective record on the
 * fields listed.
 */
function findPullRequestTitleNotices(
  prTitle: PullRequestTitleRecord | undefined,
  effective: ChangeRecord,
): MergeNotice[] {
  if (prTitle === undefined) {
    return [{ kind: 'pr-title-unparsed' }];
  }
  const fields = prTitle.type === undefined ? [] : findDifferingFields(prTitle, effective);
  return fields.length === 0 ? [] : [{ kind: 'pr-title-divergence', fields }];
}

/**
 * Reports whether a trailing body line is blank or only closes tickets: a closing keyword, as a platform reads one,
 * followed by references and nothing else.
 */
function isDroppedTrailingLine(line: string): boolean {
  const tokens = line
    .trim()
    .replace(/\.$/, '')
    .split(/[\s,]+/)
    .filter((token) => token !== '');
  const [first, ...rest] = tokens;
  if (first === undefined) {
    return true;
  }
  return (
    CLOSING_KEYWORD.test(first) &&
    rest.some((token) => TICKET_REFERENCE.test(token)) &&
    rest.every((token) => token.toLowerCase() === 'and' || CLOSING_KEYWORD.test(token) || TICKET_REFERENCE.test(token))
  );
}

/** The record that the pull-request title contains, which always names a bare title. */
type PullRequestTitleRecord = ChangeRecord & { title: string };

/** Reads the commits' consolidated record, whose marker a branch with entries always determines. */
function readCommitsRecord(consolidatedRecord: ChangeRecord | undefined): ChangeRecord {
  return consolidatedRecord === undefined
    ? {}
    : { ...toComparedFields(consolidatedRecord), breaking: consolidatedRecord.breaking === true };
}

/**
 * Reads the record that the pull-request title contains: the bare title and the ticket reference, inverted through
 * `pr.title_format`, and the scope, type, and marker of any prefix. Yields nothing when the title does not invert to a
 * bare title.
 */
function readPullRequestTitle(input: MergeInput): PullRequestTitleRecord | undefined {
  if (input.templates.pr === '') {
    return undefined;
  }
  const inverted = parse(compileTemplate(input.templates.pr), input.pr.title, input.taxonomy);
  if (inverted?.title === undefined) {
    return undefined;
  }
  const withTicketRef = inverted.ticketRef === undefined ? {} : { ticketRef: inverted.ticketRef };

  const titleBorne =
    inverted.type === undefined && input.templates.commit !== ''
      ? parse(compileTemplate(input.templates.commit), inverted.title, input.taxonomy)
      : inverted;
  if (titleBorne?.type === undefined) {
    return { ...withTicketRef, title: inverted.title };
  }
  return {
    ...toComparedFields(titleBorne),
    ...withTicketRef,
    breaking: titleBorne.breaking === true,
    title: titleBorne.title ?? inverted.title,
  };
}

/**
 * Reads the block out of its reading and raises every notice that reading the sources produces, before any record
 * resolves: a source that is absent or that could not be read, and entries that were not derived at the pull request's
 * head. It also reports whether those entries are fresh, which `chooseFromBlock` weighs.
 */
function readSources(input: MergeInput): {
  block: ChangeRecordBlock | undefined;
  entriesFresh: boolean;
  notices: MergeNotice[];
} {
  const notices: MergeNotice[] = [];
  if (input.block.kind === 'absent') {
    notices.push({ kind: 'absent-block' });
  }
  if (input.block.kind === 'malformed') {
    notices.push({ kind: 'malformed-block', defect: input.block.defect });
  }
  if (input.block.kind === 'read' && input.block.entriesDefect !== undefined) {
    notices.push({ kind: 'malformed-entries', defect: input.block.entriesDefect });
  }
  if (input.commits.kind === 'unavailable') {
    notices.push({ kind: 'commits-unavailable', reason: input.commits.reason });
  }

  const block = input.block.kind === 'read' ? input.block.block : undefined;
  const entriesFresh = block !== undefined && areEntriesFresh(block, input.pr.headCommit);
  if (block !== undefined && (block.entries?.length ?? 0) > 0 && !entriesFresh) {
    notices.push({
      kind: 'stale-entries',
      entries_commit: block.entriesCommit ?? null,
      head_commit: input.pr.headCommit,
    });
  }
  return { block, entriesFresh, notices };
}

/**
 * Renders the block's change entries as trailer values, one per entry, in the order that the block records them. Each
 * entry renders through `commit.title_format` from its type, its marker, its scopes joined by the separator, and its
 * `text` as the title, so a trailer and the commit subject that it stands for share one grammar.
 *
 * The value excludes the `Change: ` prefix, as `consolidate-branch`'s `entries[].change` does, and the writer adds it.
 * A repository whose commit grammar is empty renders none, having no trailer grammar either.
 */
function renderEntryTrailers(entries: readonly ChangeEntry[], template: string): string[] {
  if (template === '') {
    return [];
  }
  const nodes = compileTemplate(template);
  return entries.map((entry) =>
    render(nodes, {
      ...(entry.breaking && { breaking: true }),
      scope: entry.scopes.join(SCOPE_SEPARATOR),
      title: entry.text,
      type: entry.type,
    }),
  );
}

/** Renders the effective record through `merge.title_format`, falling back to the bare title when that template is empty. */
function renderMergeTitle(input: {
  effective: ChangeRecord;
  prNumber: string;
  template: string;
  ticketRef: string | undefined;
  title: string;
}): string {
  if (input.template === '') {
    return input.title;
  }
  return render(compileTemplate(input.template), {
    ...input.effective,
    prNumber: input.prNumber,
    title: input.title,
    ...(input.ticketRef !== undefined && { ticketRef: input.ticketRef }),
  });
}

/** Resolves the ticket reference from the pull-request title, then from the invocation. */
function resolveTicketRef(input: {
  prTitle: PullRequestTitleRecord | undefined;
  ticketRef: string | undefined;
}): SourcedValue | undefined {
  if (input.prTitle?.ticketRef !== undefined) {
    return { source: 'pr_title', value: input.prTitle.ticketRef };
  }
  return input.ticketRef === undefined ? undefined : { source: 'flags', value: input.ticketRef };
}

/**
 * Resolves the bare title from the caller's override, then from the pull-request title's bare title, then from the
 * block, then from the pull-request title as given.
 */
function resolveTitle(input: {
  blockTitle: string | undefined;
  overrides: MergeOverrides;
  pr: { title: string };
  prTitle: PullRequestTitleRecord | undefined;
}): SourcedValue {
  if (input.overrides.title !== undefined) {
    return { source: 'flags', value: input.overrides.title };
  }
  if (input.prTitle !== undefined) {
    return { source: 'pr_title', value: input.prTitle.title };
  }
  if (input.blockTitle !== undefined) {
    return { source: 'block', value: input.blockTitle };
  }
  return { source: 'pr_title_verbatim', value: input.pr.title };
}

/** A value, and the source that supplied it. */
interface SourcedValue {
  source: EffectiveSource;
  value: string;
}

/** Matches a ticket reference: `#123`, `owner/repo#123`, `ABC-123`, or a URL. */
const TICKET_REFERENCE = /^(?:(?:[\w.-]+\/[\w.-]+)?#\d+|[A-Z][A-Z\d]*-\d+|https?:\/\/\S+)$/;

/** Renders the block in the shape that the JSON output names, reading an absent marker within its record as not breaking. */
function toBlockOutcome(block: ChangeRecordBlock): BlockOutcome {
  const { consolidatedRecord } = block;
  return {
    title: block.title,
    consolidated_record:
      consolidatedRecord === undefined
        ? null
        : {
            scope: consolidatedRecord.scope ?? null,
            type: consolidatedRecord.type ?? null,
            breaking: consolidatedRecord.breaking === true,
          },
    overrides: { ...block.overrides },
    entries_commit: block.entriesCommit ?? null,
    entries: block.entries ?? [],
  };
}

/** Keeps only the fields on which two sources are compared: the scope, the type, and a marker that is set. */
function toComparedFields(record: ChangeRecord): ChangeRecord {
  return {
    ...(record.breaking === true && { breaking: true }),
    ...(record.scope !== undefined && { scope: record.scope }),
    ...(record.type !== undefined && { type: record.type }),
  };
}

/** Renders the pull-request title's record in the shape that the JSON output names. */
function toPullRequestTitleOutcome(record: PullRequestTitleRecord): PullRequestTitleOutcome {
  return {
    title: record.title,
    ticket_ref: record.ticketRef ?? null,
    scope: record.scope ?? null,
    type: record.type ?? null,
    breaking: record.breaking ?? null,
  };
}

/** Renders a source's record in the shape that the JSON output names; a marker that the source leaves unset becomes `null`. */
function toSourceRecordOutcome(record: ChangeRecord): SourceRecordOutcome {
  return { scope: record.scope ?? null, type: record.type ?? null, breaking: record.breaking ?? null };
}

// endregion | Helpers
