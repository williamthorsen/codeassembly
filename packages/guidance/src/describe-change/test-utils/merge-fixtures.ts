import type { ChangeRecord, Taxonomy } from '@williamthorsen/change-grammar';

import { type ChangeEntry, consolidateChangeEntries } from '../change-entries.ts';
import type { ChangeRecordBlockReading, RecordOverrides } from '../change-record-block.ts';
import type { MergeInput } from '../resolve-merge.ts';
import type { Surface } from '../types.ts';

export const BODY = '## What\n\n- Adds foo.\n';

/**
 * Builds a merge input from the house templates and a taxonomy of one type per policy. A `commitsRecord` stands for
 * commits that were read and consolidate to it; without one, the commits agree with the record ranked from the block's
 * entries, or do not contain any entry when the block records none. A `ticketRef` of null leaves the flag's reference
 * out.
 */
export function buildInput(
  changes: Partial<Omit<MergeInput, 'pr' | 'ticketRef'>> & {
    commitsRecord?: ChangeRecord;
    prBody?: string;
    prTitle?: string;
    ticketRef?: string | null;
  } = {},
): MergeInput {
  const { commitsRecord, prBody, prTitle, ticketRef, ...rest } = changes;
  const entries = rest.block?.kind === 'read' ? (rest.block.block.entries ?? []) : [];
  const consolidatedRecord =
    commitsRecord ?? (entries.length === 0 ? undefined : consolidateChangeEntries(entries, TAXONOMY));
  return {
    block: { kind: 'absent' },
    commits: { ...(consolidatedRecord !== undefined && { consolidatedRecord }), kind: 'read' },
    labels: {},
    overrides: {},
    taxonomy: TAXONOMY,
    templates: TEMPLATES,
    ...(ticketRef !== null && { ticketRef: ticketRef ?? '#466' }),
    ...rest,
    pr: {
      body: prBody ?? BODY,
      headCommit: HEAD_COMMIT,
      number: '470',
      title: prTitle ?? '#466 Add foo',
    },
  };
}

export const ENTRIES: ChangeEntry[] = [
  { breaking: false, scopes: ['kb'], text: 'Adds the store-qualified wikilink', type: 'feat' },
];

/** Builds one change entry that names the record's type, its scope if any, and its marker. */
export function entryOf(record: { breaking?: boolean; scope?: string; type: string }): ChangeEntry {
  return {
    breaking: record.breaking === true,
    scopes: record.scope === undefined ? [] : [record.scope],
    text: 'Adds foo',
    type: record.type,
  };
}

export const HEAD_COMMIT = 'e5029924aa11bb22cc33dd44ee55ff6677889900';

/**
 * Builds a block reading that records the entries given, derived at the head unless `entriesCommit` names another
 * commit or is null. Overrides are included if given, and the title defaults to the pull request's.
 */
export function readBlock(
  entries: ChangeEntry[],
  options: {
    entriesCommit?: string | null;
    entriesDefect?: string;
    overrides?: RecordOverrides;
    title?: string;
  } = {},
): ChangeRecordBlockReading {
  const entriesCommit =
    options.entriesCommit === undefined && entries.length > 0 ? HEAD_COMMIT.slice(0, 8) : options.entriesCommit;
  return {
    block: {
      title: options.title ?? 'Add foo',
      ...(entries.length > 0 && { entries }),
      ...(typeof entriesCommit === 'string' && { entriesCommit }),
      ...(options.overrides !== undefined && { overrides: options.overrides }),
    },
    ...(options.entriesDefect !== undefined && { entriesDefect: options.entriesDefect }),
    kind: 'read',
  };
}

/** A taxonomy declaring every breaking policy, independent of the repository's own. */
export const TAXONOMY: Taxonomy = {
  tiers: ['public', 'internal', 'process'],
  types: [
    { breakingPolicy: 'optional', key: 'feat', tier: 'public' },
    { breakingPolicy: 'optional', key: 'drop', tier: 'public' },
    { breakingPolicy: 'optional', key: 'sec', tier: 'public' },
    { breakingPolicy: 'forbidden', key: 'docs', tier: 'process' },
  ],
};

export const TEMPLATES: Record<Surface, string> = {
  commit: '[[{scope}|]{type}: ]{title}',
  merge: '[{ticket_ref} ][[{scope}|]{type}: ]{title}[ (#{pr_number})]',
  pr: '[{ticket_ref} ]{title}',
  ticket: '{title}',
};

/** Builds commits that could not be read, for the reason given. */
export function unavailable(reason: string): MergeInput['commits'] {
  return { kind: 'unavailable', reason };
}
