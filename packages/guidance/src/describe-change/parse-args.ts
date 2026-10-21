import { BREAKING_MARKER } from '@williamthorsen/change-grammar';

import { type FlagSpec, scanFlags, type ScanResult, valueFlagMap } from '../lib/parse-flags.ts';
import type { EntryAmendment } from './amend-entry.ts';
import {
  readOverrideFlags,
  readOverrideType,
  readProjectRootFlag,
  readRecordFlags,
  readRepeatedValues,
  readRequiredValue,
  refusePositionals,
} from './read-flag-values.ts';
import type { MergeOverrides } from './resolve-merge.ts';
import {
  isSurface,
  type ParsedArgs,
  type ResolveMergeArgs,
  type Subcommand,
  type SubcommandSpec,
  SURFACES,
} from './types.ts';

/** The flags that set an override, which a `change-record` block records and a resolved record applies. */
const OVERRIDE_FLAGS: readonly FlagSpec[] = [
  { name: 'override-breaking', takesValue: false },
  { name: 'override-scope', takesValue: true },
  { name: 'override-type', takesValue: true },
];

/** The flags that set a record's title, scope, type, and breaking marker. */
const RECORD_FLAGS: readonly FlagSpec[] = [
  { name: 'breaking', takesValue: false },
  { name: 'scope', takesValue: true },
  { name: 'title', takesValue: true },
  { name: 'type', takesValue: true },
];

/**
 * Parses the helper's argv into what the run asks for. The first argument names the subcommand, and the rest are
 * scanned against that subcommand's flags alone, so a flag that only another subcommand takes is refused as unknown.
 *
 * `render-titles`, `resolve-effective-record`, and `render-block` accept `--type feat!`, which the engine splits into the
 * bare type and the breaking marker. An `--override-type` spelled with the marker is refused, since the breaking overrides
 * set it. `amend-entry` likewise refuses a `--type` spelled with the marker, since `--breaking` sets it.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [subcommand, ...rest] = argv;
  if (subcommand === undefined || !isSubcommand(subcommand)) {
    throw new Error(buildUsageMessage(subcommand));
  }
  const { flags, read } = SUBCOMMANDS[subcommand];
  return read(scanFlags(rest, flags));
}

/** The name under which this helper reports itself on stderr. */
export const PROGRAM = 'describe-change';

/**
 * Each subcommand's flags, and the reader of its scanned arguments, in the order that the usage error lists them.
 *
 * @internal - Exported to allow testing.
 */
export const SUBCOMMANDS: Record<Subcommand, SubcommandSpec> = {
  'render-titles': {
    flags: [
      ...RECORD_FLAGS,
      { name: 'pr-number', takesValue: true },
      { name: 'project-root', takesValue: true },
      { name: 'ticket-ref', takesValue: true },
    ],
    read: readRenderTitlesArgs,
  },
  'parse-title': { flags: [], read: readParseTitleArgs },
  'consolidate-branch': { flags: [{ name: 'base', takesValue: true }], read: readConsolidateBranchArgs },
  'consolidate-entries': { flags: [{ name: 'entries-file', takesValue: true }], read: readConsolidateEntriesArgs },
  'resolve-ticket-type': { flags: [{ name: 'ticket-label', takesValue: true }], read: readResolveTicketTypeArgs },
  'resolve-effective-record': { flags: [...RECORD_FLAGS, ...OVERRIDE_FLAGS], read: readResolveEffectiveRecordArgs },
  'render-block': {
    flags: [
      ...OVERRIDE_FLAGS,
      { name: 'entries-commit', takesValue: true },
      { name: 'entries-file', takesValue: true },
      { name: 'title', takesValue: true },
    ],
    read: readRenderBlockArgs,
  },
  'render-details': { flags: [{ name: 'entries-file', takesValue: true }], read: readRenderDetailsArgs },
  'resolve-merge': {
    flags: [
      { name: 'base', takesValue: true },
      { name: 'head', takesValue: true },
      { name: 'no-override-breaking', takesValue: false },
      ...OVERRIDE_FLAGS,
      { name: 'override-title', takesValue: true },
      { name: 'pr-body-file', takesValue: true },
      { name: 'pr-label', takesValue: true },
      { name: 'pr-number', takesValue: true },
      { name: 'pr-title', takesValue: true },
      { name: 'ticket-ref', takesValue: true },
    ],
    read: readResolveMergeArgs,
  },
  'check-merge-body': {
    flags: [
      { name: 'body-file', takesValue: true },
      { name: 'entry-count', takesValue: true },
    ],
    read: readCheckMergeBodyArgs,
  },
  'amend-entry': {
    flags: [
      { name: 'body-file', takesValue: true },
      { name: 'breaking', takesValue: false },
      { name: 'entry', takesValue: true },
      { name: 'no-breaking', takesValue: false },
      { name: 'type', takesValue: true },
    ],
    read: readAmendEntryArgs,
  },
  'resolve-scopes': { flags: [{ name: 'path', takesValue: true }], read: readResolveScopesArgs },
  'resolve-labels': {
    flags: [
      { name: 'body-file', takesValue: true },
      { name: 'breaking', takesValue: false },
      { name: 'project-root', takesValue: true },
      { name: 'scope', takesValue: true },
      { name: 'type', takesValue: true },
    ],
    read: readResolveLabelsArgs,
  },
};

// region | Helpers

/** Builds the usage error for a missing or unknown subcommand, listing every subcommand that the helper takes. */
function buildUsageMessage(subcommand: string | undefined): string {
  const usage = `usage: ${PROGRAM} <subcommand> [flags], where <subcommand> is one of ${Object.keys(SUBCOMMANDS).join(', ')}`;
  return subcommand === undefined ? `a subcommand is required; ${usage}` : `unknown subcommand ${subcommand}; ${usage}`;
}

/** Reports whether `value` names one of the helper's subcommands. */
function isSubcommand(value: string): value is Subcommand {
  return Object.hasOwn(SUBCOMMANDS, value);
}

/**
 * Reads the `amend-entry` invocation: the body file, the 0-based index of the entry to amend, and the fields that the
 * amendment sets, of which there must be at least one.
 */
function readAmendEntryArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  const values = valueFlagMap(flags);
  const entry = readRequiredValue('amend-entry', values, 'entry');
  if (!/^\d+$/.test(entry)) {
    throw new Error(`--entry takes the entry’s 0-based index; got ${entry}`);
  }
  const breakingFlags = new Set(
    flags.filter((flag) => flag.name === 'breaking' || flag.name === 'no-breaking').map((flag) => flag.name),
  );
  if (breakingFlags.size > 1) {
    throw new Error('--breaking and --no-breaking set the marker in opposite directions; pass one');
  }
  const type = values['type']?.trim();
  if (type === '') {
    throw new Error('--type requires a value');
  }
  if (type?.endsWith(BREAKING_MARKER) === true) {
    throw new Error('--type takes a bare type; pass --breaking for a breaking change');
  }

  const [breakingFlag] = breakingFlags;
  const amendment: EntryAmendment = {
    ...(breakingFlag !== undefined && { breaking: breakingFlag === 'breaking' }),
    ...(type !== undefined && { type }),
  };
  if (Object.keys(amendment).length === 0) {
    throw new Error('amend-entry requires --type, --breaking, or --no-breaking');
  }
  return {
    amendment,
    bodyFile: readRequiredValue('amend-entry', values, 'body-file'),
    entryIndex: Number(entry),
    subcommand: 'amend-entry',
  };
}

/** Reads the `check-merge-body` invocation: the path of the composed merge body and the entry count that it must record. */
function readCheckMergeBodyArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  const values = valueFlagMap(flags);
  const entryCount = readRequiredValue('check-merge-body', values, 'entry-count');
  if (!/^\d+$/.test(entryCount)) {
    throw new Error(`--entry-count takes a non-negative integer; got ${entryCount}`);
  }
  return {
    bodyFile: readRequiredValue('check-merge-body', values, 'body-file'),
    entryCount: Number(entryCount),
    subcommand: 'check-merge-body',
  };
}

/** Reads the `consolidate-branch` invocation: the base ref of the range to read. */
function readConsolidateBranchArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  return {
    baseRef: readRequiredValue('consolidate-branch', valueFlagMap(flags), 'base'),
    subcommand: 'consolidate-branch',
  };
}

/** Reads the `consolidate-entries` invocation: the path of the entries file to consolidate. */
function readConsolidateEntriesArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  return {
    entriesFile: readRequiredValue('consolidate-entries', valueFlagMap(flags), 'entries-file'),
    subcommand: 'consolidate-entries',
  };
}

/** Reads the `parse-title` invocation: the surface whose template reads the subject, then the subject itself. */
function readParseTitleArgs({ positionals }: ScanResult): ParsedArgs {
  const [surface, subject] = positionals;
  if (surface === undefined || subject === undefined) {
    throw new Error('parse-title takes the surface and the subject string to read');
  }
  if (!isSurface(surface)) {
    throw new Error(`parse-title must name one of ${SURFACES.join(', ')}`);
  }
  refusePositionals(positionals.slice(2));
  return { subcommand: 'parse-title', subject, surface };
}

/**
 * Reads the `render-block` invocation: the required title, the author's overrides, and the entries file and derivation
 * commit that the block records.
 *
 * `--entries-commit` requires `--entries-file`, since a derivation commit with nothing derived at it records a claim
 * about nothing.
 */
function readRenderBlockArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  const values = valueFlagMap(flags);
  const title = readRequiredValue('render-block', values, 'title');
  const overrides = readOverrideFlags(flags);
  for (const name of ['entries-commit', 'entries-file']) {
    if (values[name]?.trim() === '') {
      throw new Error(`--${name} requires a value`);
    }
  }
  const entriesCommit = values['entries-commit']?.trim();
  const entriesFile = values['entries-file']?.trim();
  if (entriesCommit !== undefined && entriesFile === undefined) {
    throw new Error('--entries-commit records the commit at which the entries were derived; pass --entries-file too');
  }
  return {
    block: { overrides, title, ...(entriesCommit !== undefined && { entriesCommit }) },
    ...(entriesFile !== undefined && { entriesFile }),
    subcommand: 'render-block',
  };
}

/** Reads the `render-details` invocation: the required entries file. */
function readRenderDetailsArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  return {
    entriesFile: readRequiredValue('render-details', valueFlagMap(flags), 'entries-file'),
    subcommand: 'render-details',
  };
}

/**
 * Reads the `render-titles` invocation into a record. Every flag is optional, and a flag left off resolves its token to
 * empty, so an invocation without flags renders each template against an empty record.
 */
function readRenderTitlesArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  const projectRoot = readProjectRootFlag(flags);
  return {
    ...(projectRoot !== undefined && { projectRoot }),
    record: readRecordFlags(flags),
    subcommand: 'render-titles',
  };
}

/** Reads the `resolve-effective-record` invocation: the record flags and the author's overrides. */
function readResolveEffectiveRecordArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  return {
    overrides: readOverrideFlags(flags),
    record: readRecordFlags(flags),
    subcommand: 'resolve-effective-record',
  };
}

/**
 * Reads the `resolve-labels` invocation: the effective record's flags, and the optional path of the body whose entries
 * are labeled with it.
 */
function readResolveLabelsArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  const bodyFile = valueFlagMap(flags)['body-file']?.trim();
  if (bodyFile === '') {
    throw new Error('--body-file requires a value');
  }
  const projectRoot = readProjectRootFlag(flags);
  return {
    ...(bodyFile !== undefined && { bodyFile }),
    ...(projectRoot !== undefined && { projectRoot }),
    record: readRecordFlags(flags),
    subcommand: 'resolve-labels',
  };
}

/** Reads the `resolve-merge` invocation: the pull request's range and inputs, and the author's overrides. */
function readResolveMergeArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  const values = valueFlagMap(flags);
  const baseRef = readRequiredValue('resolve-merge', values, 'base');
  const prNumber = readRequiredValue('resolve-merge', values, 'pr-number');
  if (!/^\d+$/.test(prNumber)) {
    throw new Error(`--pr-number takes the pull request’s number; got ${prNumber}`);
  }
  const breakingFlags = new Set(
    flags.filter((flag) => flag.name.endsWith('override-breaking')).map((flag) => flag.name),
  );
  if (breakingFlags.size > 1) {
    throw new Error('--override-breaking and --no-override-breaking set the marker in opposite directions; pass one');
  }
  for (const name of ['override-scope', 'override-title', 'override-type', 'ticket-ref']) {
    if (values[name]?.trim() === '') {
      throw new Error(`--${name} requires a value`);
    }
  }
  const type = readOverrideType(values);

  const [breakingFlag] = breakingFlags;
  const scope = values['override-scope']?.trim();
  const title = values['override-title']?.trim();
  const ticketRef = values['ticket-ref']?.trim();
  const overrides: MergeOverrides = {
    ...(breakingFlag !== undefined && { breaking: breakingFlag === 'override-breaking' }),
    ...(scope !== undefined && { scope }),
    ...(title !== undefined && { title }),
    ...(type !== undefined && { type }),
  };
  const merge: ResolveMergeArgs = {
    baseRef,
    headCommit: readRequiredValue('resolve-merge', values, 'head'),
    overrides,
    prBodyFile: readRequiredValue('resolve-merge', values, 'pr-body-file'),
    prLabels: readRepeatedValues(flags, 'pr-label'),
    prNumber,
    prTitle: readRequiredValue('resolve-merge', values, 'pr-title'),
    ...(ticketRef !== undefined && { ticketRef }),
  };
  return { merge, subcommand: 'resolve-merge' };
}

/** Reads the `resolve-scopes` invocation: every path whose scope the run resolves. */
function readResolveScopesArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  return { paths: readRepeatedValues(flags, 'path'), subcommand: 'resolve-scopes' };
}

/** Reads the `resolve-ticket-type` invocation: every label on the ticket. */
function readResolveTicketTypeArgs({ flags, positionals }: ScanResult): ParsedArgs {
  refusePositionals(positionals);
  return { subcommand: 'resolve-ticket-type', ticketLabels: readRepeatedValues(flags, 'ticket-label') };
}

// endregion | Helpers
