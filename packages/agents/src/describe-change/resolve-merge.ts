import { applyOverrides, type Overrides } from '../change-grammar/apply-overrides.ts';
import { compileTemplate } from '../change-grammar/compile-template.ts';
import { parse } from '../change-grammar/parse.ts';
import { render } from '../change-grammar/render.ts';
import type { ChangeRecord, Taxonomy } from '../change-grammar/types.ts';
import { extractSection } from '../lib/markdown-sections.ts';
import {
  type ChangeRecordBlock,
  type ChangeRecordBlockReading,
  stripChangeRecordBlocks,
} from './change-record-block.ts';
import { findDefects, type RecordDefect } from './find-defects.ts';
import type { HeadOutcome, Surface } from './types.ts';

/**
 * Resolves what a pull request merges as: the effective head, the bare title and ticket reference, the merge title, and
 * the merge body, with the defects that block approval and the notices that the approval gate shows.
 *
 * With a readable `change-record` block, the recorded head and the derivation are compared before any override. Where
 * they agree, or where the derivation is unavailable, the record stands. Where they disagree, the derivation wins as the
 * fresher of the two, and the record is shown.
 * Without a readable block, the type and its breaking marker come together from the labels where a type label resolved
 * and otherwise from the derivation, and the scope resolves on its own the same way; a disagreeing derivation is shown.
 *
 * The record's overrides then apply to the winning head, and the caller's overrides apply last, through `applyOverrides`.
 *
 * The bare title comes from inverting the pull-request title through `pr.title_format`. A scope and type read from it,
 * through that template where it names `{type}` and otherwise through `commit.title_format`, never stay in the title;
 * where they differ from the effective head, they are offered as a candidate head. A caller's title outranks all of it.
 */
export function resolveMerge(input: MergeInput): MergeReport {
  const notices: MergeNotice[] = [];
  if (input.block.kind === 'malformed') {
    notices.push({ defect: input.block.defect, kind: 'malformed-record' });
  }
  const derived = input.derivation.kind === 'derived' ? toHead(input.derivation.head) : undefined;
  if (input.derivation.kind === 'unavailable') {
    notices.push({ kind: 'derivation-unavailable', reason: input.derivation.reason });
  }

  const record = input.block.kind === 'read' ? input.block.block : undefined;
  const labeled = toHead(input.labeled);
  const resolved =
    record === undefined
      ? chooseFromLabels({ derived, labeled, notices })
      : applyOverrides(chooseFromRecord({ derived, notices, record }), record.overrides ?? {});
  const head = applyOverrides(resolved, input.overrides);

  const { candidate, ticketRef, title } = resolveTitle({ ...input, head, notices, recordTitle: record?.title });
  if (candidate !== undefined) {
    notices.push({ head: toOutcome(candidate), kind: 'candidate-head' });
  }

  const mergeRecord: ChangeRecord = {
    ...head,
    prNumber: input.pr.number,
    title,
    ...(ticketRef !== undefined && { ticketRef }),
  };
  return {
    head: toOutcome(head),
    recorded: record === undefined ? null : toOutcome(toHead(record.consolidatedRecord ?? {})),
    derived: derived === undefined ? null : toOutcome(derived),
    labeled:
      record === undefined && (labeled.scope !== undefined || labeled.type !== undefined) ? toOutcome(labeled) : null,
    title,
    ticket_ref: ticketRef ?? null,
    merge_title: input.templates.merge === '' ? title : render(compileTemplate(input.templates.merge), mergeRecord),
    body: composeBody(input.pr.body),
    defects: findDefects(head, input.taxonomy),
    notices,
  };
}

/** What a merge resolves from. */
export interface MergeInput {
  /** The pull-request body's last `change-record` block, as read. */
  block: ChangeRecordBlockReading;
  /** The head that the pull request's commits consolidate to, or the reason that none could be derived. */
  derivation: { head: ChangeRecord; kind: 'derived' } | { kind: 'unavailable'; reason: string };
  /** The head that the pull request's labels resolve to. */
  labeled: ChangeRecord;
  overrides: MergeOverrides;
  pr: { body: string; headCommit: string; number: string; title: string };
  taxonomy: Taxonomy;
  templates: Record<Surface, string>;
  /** The ticket reference that applies where the pull-request title yields none. */
  ticketRef?: string;
}

/** Something the approval gate shows the author without blocking approval. */
export type MergeNotice =
  | { head: HeadOutcome; kind: 'candidate-head' }
  | { defect: string; kind: 'malformed-record' }
  | { kind: 'derivation-unavailable'; reason: string }
  | { kind: 'divergence'; shown: HeadOutcome; used: 'derivation' | 'labels' }
  | { kind: 'title-fallback'; source: 'pr-title' | 'record' };

/** The author's overrides, each outranking every other source for its own dimension. */
export interface MergeOverrides extends Overrides {
  title?: string;
}

/** The resolved merge, in the shape the JSON output names. */
export interface MergeReport {
  body: string;
  defects: RecordDefect[];
  derived: HeadOutcome | null;
  head: HeadOutcome;
  labeled: HeadOutcome | null;
  merge_title: string;
  notices: MergeNotice[];
  recorded: HeadOutcome | null;
  ticket_ref: string | null;
  title: string;
}

// region | Helpers

/**
 * Chooses the head without a readable block: the type and its marker from the labels where a type label resolved,
 * otherwise from the derivation, and the scope from its label where one resolved, otherwise from the derivation.
 */
function chooseFromLabels(input: {
  derived: ChangeRecord | undefined;
  labeled: ChangeRecord;
  notices: MergeNotice[];
}): ChangeRecord {
  const typed = input.labeled.type === undefined ? (input.derived ?? {}) : input.labeled;
  const scope = input.labeled.scope ?? input.derived?.scope;
  const head: ChangeRecord = {
    ...(typed.type !== undefined && typed.breaking === true && { breaking: true }),
    ...(scope !== undefined && { scope }),
    ...(typed.type !== undefined && { type: typed.type }),
  };
  if (input.derived !== undefined && !isSameHead(head, input.derived)) {
    input.notices.push({ kind: 'divergence', shown: toOutcome(input.derived), used: 'labels' });
  }
  return head;
}

/**
 * Chooses between the recorded head and the derivation, reporting the record where they disagree. The derivation wins
 * wherever one is available, as the fresher of two derivations of the same branch; the record stands only where the
 * commits could not be read.
 */
function chooseFromRecord(input: {
  derived: ChangeRecord | undefined;
  notices: MergeNotice[];
  record: ChangeRecordBlock;
}): ChangeRecord {
  const recorded = toHead(input.record.consolidatedRecord ?? {});
  if (input.derived === undefined || isSameHead(recorded, input.derived)) {
    return recorded;
  }
  input.notices.push({ kind: 'divergence', shown: toOutcome(recorded), used: 'derivation' });
  return input.derived;
}

/** Matches a keyword with which a platform closes the tickets that follow it, with an optional colon. */
const CLOSING_KEYWORD = /^(?:close[ds]?|fix(?:e[ds])?|resolve[ds]?):?$/i;

/**
 * Composes the merge body from the pull request's `## What` section, with every `change-record` block removed and the
 * trailing lines that only close a ticket dropped, so neither reaches the merge commit.
 */
function composeBody(body: string): string {
  const section = extractSection({ heading: 'What', text: body.replaceAll('\r\n', '\n') }) ?? '';
  const lines = stripChangeRecordBlocks(section).split('\n');
  while (lines.length > 0 && isDroppedTrailingLine(lines.at(-1) ?? '')) {
    lines.pop();
  }
  return lines.join('\n').trim();
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

/** Reports whether two heads name the same scope, type, and breaking marker. */
function isSameHead(left: ChangeRecord, right: ChangeRecord): boolean {
  return (
    left.scope === right.scope && left.type === right.type && (left.breaking === true) === (right.breaking === true)
  );
}

/**
 * Resolves the bare title, the ticket reference, and any candidate head that the pull-request title carries. Where the
 * title does not invert, the recorded title stands in for it, and the title itself where no record is readable.
 */
function resolveTitle(input: {
  head: ChangeRecord;
  notices: MergeNotice[];
  overrides: MergeOverrides;
  pr: { title: string };
  recordTitle: string | undefined;
  taxonomy: Taxonomy;
  templates: Record<Surface, string>;
  ticketRef?: string;
}): { candidate?: ChangeRecord; ticketRef?: string; title: string } {
  const inverted =
    input.templates.pr === '' ? undefined : parse(compileTemplate(input.templates.pr), input.pr.title, input.taxonomy);
  const ticketRef = inverted?.ticketRef ?? input.ticketRef;
  const withTicketRef = ticketRef === undefined ? {} : { ticketRef };

  if (input.overrides.title !== undefined) {
    return { ...withTicketRef, title: input.overrides.title };
  }
  if (inverted?.title === undefined) {
    input.notices.push({ kind: 'title-fallback', source: input.recordTitle === undefined ? 'pr-title' : 'record' });
    return { ...withTicketRef, title: input.recordTitle ?? input.pr.title };
  }

  const titleBorne =
    inverted.type === undefined && input.templates.commit !== ''
      ? parse(compileTemplate(input.templates.commit), inverted.title, input.taxonomy)
      : inverted;
  if (titleBorne?.type === undefined) {
    return { ...withTicketRef, title: inverted.title };
  }
  const title = titleBorne.title ?? inverted.title;
  const candidate = toHead(titleBorne);
  return isSameHead(candidate, input.head) ? { ...withTicketRef, title } : { ...withTicketRef, candidate, title };
}

/** Matches a ticket reference: `#123`, `owner/repo#123`, `ABC-123`, or a URL. */
const TICKET_REFERENCE = /^(?:(?:[\w.-]+\/[\w.-]+)?#\d+|[A-Z][A-Z\d]*-\d+|https?:\/\/\S+)$/;

/** Keeps only the head's dimensions of a record: the scope, the type, and the breaking marker. */
function toHead(record: ChangeRecord): ChangeRecord {
  return {
    ...(record.breaking === true && { breaking: true }),
    ...(record.scope !== undefined && { scope: record.scope }),
    ...(record.type !== undefined && { type: record.type }),
  };
}

/** Renders a head in the shape the JSON output names. */
function toOutcome(head: ChangeRecord): HeadOutcome {
  return { breaking: head.breaking === true, scope: head.scope ?? null, type: head.type ?? null };
}

// endregion | Helpers
