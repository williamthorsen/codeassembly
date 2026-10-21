import { type ChangeRecord, compileTemplate, render } from '@williamthorsen/change-grammar';

import { extractSection } from '../lib/markdown-sections.ts';
import type { ChangeEntry } from './change-entries.ts';
import { renderMergeChangeRecordBlock, stripChangeRecordBlocks } from './change-record-block.ts';
import type { EffectiveSource, MergeOverrides, PullRequestTitleRecord } from './resolve-merge.ts';

/** Matches a keyword with which a platform closes the tickets that follow it, with an optional colon. */
const CLOSING_KEYWORD = /^(?:close[ds]?|fix(?:e[ds])?|resolve[ds]?):?$/i;

/** Matches a ticket reference: `#123`, `owner/repo#123`, `ABC-123`, or a URL. */
const TICKET_REFERENCE = /^(?:(?:[\w.-]+\/[\w.-]+)?#\d+|[A-Z][A-Z\d]*-\d+|https?:\/\/\S+)$/;

/**
 * Composes the merge body from the pull request's `## What` section, with every `change-record` block removed and the
 * trailing lines that only close a ticket dropped, so neither appears in the merge commit.
 */
export function composeBody(body: string): string {
  const section = extractSection({ heading: 'What', text: body.replaceAll('\r\n', '\n') }) ?? '';
  const lines = stripChangeRecordBlocks(section).split('\n');
  while (lines.length > 0 && isDroppedTrailingLine(lines.at(-1) ?? '')) {
    lines.pop();
  }
  return lines.join('\n').trim();
}

/**
 * Renders the merge-commit `change-record` block from the block's change entries, or `null` when there is none, since a
 * block without entries tells release-kit nothing. A pull-request number that is not a positive integer is omitted.
 */
export function renderMergeBlock(input: {
  entries: ChangeEntry[];
  prNumber: string;
  ticketRef: string | undefined;
}): string | null {
  if (input.entries.length === 0) {
    return null;
  }
  const prNumber = Number(input.prNumber);
  return renderMergeChangeRecordBlock({
    entries: input.entries,
    ...(Number.isSafeInteger(prNumber) && prNumber > 0 && { prNumber }),
    ...(input.ticketRef !== undefined && { ticketRef: input.ticketRef }),
  });
}

/** Renders the effective record through `merge.title_format`, falling back to the bare title when that template is empty. */
export function renderMergeTitle(input: {
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
export function resolveTicketRef(input: {
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
export function resolveTitle(input: {
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

// region | Helpers

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

/** A value, and the source that supplied it. */
interface SourcedValue {
  source: EffectiveSource;
  value: string;
}

// endregion | Helpers
