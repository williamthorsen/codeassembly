import { Document, isMap, isSeq, parseDocument } from 'yaml';

import type { Overrides } from '../change-grammar/apply-overrides.ts';
import { normalizeChangeRecord } from '../change-grammar/tokens.ts';
import type { ChangeRecord } from '../change-grammar/types.ts';
import { isRecord } from '../lib/type-guards.ts';
import { type ChangeEntry, readChangeEntries } from './change-entries.ts';

/**
 * Reads the last `change-record` block in a pull-request body back into what it records, as the inverse of
 * `renderChangeRecordBlock`: the body contains no block, contains one that cannot be read, or contains one that reads.
 *
 * A block without a `title` does not read. `consolidated_record` and `overrides` normalize as the renderer normalizes
 * them. Because a key that the grammar does not declare is ignored, a later addition to the block does not break this
 * reader. A declared key whose value is null reads as absent.
 *
 * A defective `entries` list is the one departure from the block's all-or-nothing rule: The block reads with its
 * entries absent and the defect reported alongside it, since its title and its consolidated record are still usable. A
 * block that loses either of those has nothing left to resolve from, so every other field keeps the rule.
 */
export function readChangeRecordBlock(body: string): ChangeRecordBlockReading {
  const parsed = parseLastBlock(body);
  return 'payload' in parsed ? readPayload(parsed.payload) : parsed;
}

/**
 * Reads the last `change-record` block in a merge-commit body back into what it records, as the inverse of
 * `renderMergeChangeRecordBlock`.
 *
 * The reader applies the rules that release-kit applies when it reads the merge commit, so any defect makes the whole
 * block malformed and no entry is salvaged from a defective list. A key that the grammar does not declare is ignored,
 * and a declared key whose value is null reads as absent.
 */
export function readMergeChangeRecordBlock(body: string): MergeChangeRecordBlockReading {
  const parsed = parseLastBlock(body);
  return 'payload' in parsed ? readMergePayload(parsed.payload) : parsed;
}

/**
 * Renders the fenced `change-record` block that a pull-request body contains as its final block.
 *
 * The payload is YAML rather than a surface template, because `consolidated_record` and `overrides` nest and a template
 * renders one flat line. Its inverse is a YAML parse rather than a compiled pattern, so the pair needs no round-trip
 * verification of the kind required by the title grammar.
 *
 * The consolidated record and the overrides are normalized as the engine normalizes any record. A field that the
 * branch did not determine is absent rather than empty, a marker spelled on a type splits into the type and `breaking`,
 * and `breaking` appears only when it is true. Each group is omitted when it is empty, as are the entries. The
 * derivation commit appears only beside entries, since it records a claim about them.
 *
 * The scalars precede the entry list, so the bulky list does not separate them from each other. An entry's `scopes`
 * render in flow form, keeping each entry compact.
 */
export function renderChangeRecordBlock(block: ChangeRecordBlock): string {
  const consolidatedRecord = normalizeConsolidatedRecord(block.consolidatedRecord ?? {});
  const overrides = normalizeOverrides(block.overrides ?? {});
  const entriesCommit = block.entriesCommit?.trim();
  const entries = block.entries ?? [];
  const payload = {
    title: block.title.trim(),
    ...(Object.keys(consolidatedRecord).length > 0 && { consolidated_record: consolidatedRecord }),
    ...(Object.keys(overrides).length > 0 && { overrides }),
    ...(entries.length > 0 && {
      ...(entriesCommit !== undefined && entriesCommit !== '' && { entries_commit: entriesCommit }),
      entries: entries.map(toEntryPayload),
    }),
  };
  return `${FENCE}${INFO_STRING}\n${stringifyPayload(payload)}${FENCE}`;
}

/**
 * Renders the fenced `change-record` block that a merge-commit body contains below its lede: the change entries, with
 * the pull-request number and the ticket reference that release-kit reads as data. The scalars precede the entry list,
 * and each entry renders as it does in the pull-request form.
 */
export function renderMergeChangeRecordBlock(block: MergeChangeRecordBlock): string {
  const ticketRef = block.ticketRef?.trim();
  const payload = {
    ...(block.prNumber !== undefined && { pr_number: block.prNumber }),
    ...(ticketRef !== undefined && ticketRef !== '' && { ticket_ref: ticketRef }),
    entries: block.entries.map(toEntryPayload),
  };
  return `${FENCE}${INFO_STRING}\n${stringifyPayload(payload)}${FENCE}`;
}

/**
 * Replaces a body's last `change-record` block, fences included, with `block`, leaving every other byte of the body as
 * it was. The block's lines take the line ending that follows the opening fence. Throws when the body's last block is
 * absent or never closes.
 */
export function replaceLastChangeRecordBlock(body: string, block: string): string {
  const parts = body.split(/(\r?\n)/);
  const lines = parts.filter((_part, index) => index % 2 === 0);
  const fence = findFences(lines).at(-1);
  if (fence?.close === undefined) {
    throw new Error('the body contains no closed change-record block to replace');
  }
  const lineEnding = parts[fence.open * 2 + 1] ?? '\n';
  return [
    ...parts.slice(0, fence.open * 2),
    block.split('\n').join(lineEnding),
    ...parts.slice(fence.close * 2 + 1),
  ].join('');
}

/**
 * Removes every `change-record` block from a text, fences included, joining the remaining lines with `\n`. A block that
 * never closes runs to the end of the text, as a Markdown renderer reads it.
 */
export function stripChangeRecordBlocks(text: string): string {
  const lines = splitLines(text);
  const fences = findFences(lines);
  return lines
    .filter((_line, index) => fences.every((fence) => index < fence.open || index > (fence.close ?? lines.length)))
    .join('\n');
}

/**
 * What the block records: the title, the consolidated record of the branch, the overrides that the author applied, the
 * change entries, and the commit at which those entries were derived. Only the scope, type, and breaking marker of
 * `consolidatedRecord` are recorded, and `entriesCommit` is the short SHA as the change summary wrote it.
 */
export interface ChangeRecordBlock {
  consolidatedRecord?: ChangeRecord;
  entries?: ChangeEntry[];
  entriesCommit?: string;
  overrides?: RecordOverrides;
  title: string;
}

/**
 * What a body's last `change-record` block reads as: absent, malformed with the defect named, or the block that it
 * records. A read block includes `entriesDefect` when its entries were defective, in which case it records none.
 */
export type ChangeRecordBlockReading =
  | { kind: 'absent' }
  | { defect: string; kind: 'malformed' }
  | { block: ChangeRecordBlock; entriesDefect?: string; kind: 'read' };

/** What a merge commit's block records: the change entries, the pull-request number, and the ticket reference. */
export interface MergeChangeRecordBlock {
  entries: ChangeEntry[];
  prNumber?: number;
  ticketRef?: string;
}

/** What a merge-commit body's last `change-record` block reads as: absent, malformed with the defect named, or read. */
export type MergeChangeRecordBlockReading =
  { kind: 'absent' } | { defect: string; kind: 'malformed' } | { block: MergeChangeRecordBlock; kind: 'read' };

/**
 * The overrides that a block records, named as the flags that set them are. A `scope` of `*` sets no scope. `breaking`
 * is only ever `true`: A block's override can add the marker to a record but not remove it.
 */
export interface RecordOverrides extends Overrides {
  breaking?: true;
}

// region | Helpers

/** Opens and closes the block. */
const FENCE = '```';

/** One block's place in a text: the indices of its fence lines, `close` absent for a block that never closes. */
interface FenceSpan {
  close?: number;
  open: number;
}

/** Locates each `change-record` block in a text's lines, in document order. */
function findFences(lines: readonly string[]): FenceSpan[] {
  const fences: FenceSpan[] = [];
  let open: number | undefined;
  for (const [index, line] of lines.entries()) {
    if (open === undefined) {
      if (line.trim() === `${FENCE}${INFO_STRING}`) {
        open = index;
      }
    } else if (line.trim() === FENCE) {
      fences.push({ close: index, open });
      open = undefined;
    }
  }
  if (open !== undefined) {
    fences.push({ open });
  }
  return fences;
}

/** Names the block's kind on the opening fence, distinguishing it from any other fence in the body. */
const INFO_STRING = 'change-record';

/** Keeps only the scope, type, and breaking marker of a normalized record, which a consolidated record consists of. */
function normalizeConsolidatedRecord(record: ChangeRecord): ChangeRecord {
  const { breaking, scope, type } = normalizeChangeRecord(record);
  return {
    ...(scope !== undefined && { scope }),
    ...(type !== undefined && { type }),
    ...(breaking === true && { breaking }),
  };
}

/**
 * Keeps only the overridable dimensions of a normalized record, so a marker spelled on the type becomes `breaking`. The
 * scope is kept as given, `*` included, since an override of `*` is the author's choice of no scope.
 */
function normalizeOverrides(overrides: RecordOverrides): RecordOverrides {
  const { breaking, type } = normalizeChangeRecord(overrides);
  const scope = overrides.scope?.trim();
  return {
    ...(scope !== undefined && scope !== '' && { scope }),
    ...(type !== undefined && { type }),
    ...(breaking === true && { breaking }),
  };
}

/** Parses the payload of a body's last `change-record` block, or reports the block absent or malformed. */
function parseLastBlock(
  body: string,
): { kind: 'absent' } | { defect: string; kind: 'malformed' } | { payload: unknown } {
  const lines = splitLines(body);
  const fence = findFences(lines).at(-1);
  if (fence === undefined) {
    return { kind: 'absent' };
  }
  if (fence.close === undefined) {
    return { defect: 'the block opens but never closes', kind: 'malformed' };
  }

  const document = parseDocument(lines.slice(fence.open + 1, fence.close).join('\n'));
  const [error] = document.errors;
  if (error !== undefined) {
    const message = (error.message.split('\n', 1)[0] ?? '').replace(/:$/, '');
    return { defect: `the payload is not valid YAML: ${message}`, kind: 'malformed' };
  }
  return { payload: document.toJS() };
}

/**
 * Reads the entries and their derivation commit, which read together: A defect in either leaves both absent, since a
 * derivation commit records a claim about the entries. An empty list reads as no entries, as the renderer writes one.
 */
function readEntryFields(
  payload: Record<string, unknown>,
): { defect: string } | { entries?: ChangeEntry[]; entriesCommit?: string } {
  const commit = payload.entries_commit;
  if (commit !== undefined && commit !== null && typeof commit !== 'string') {
    return { defect: '`entries_commit` is not a string' };
  }
  const entriesCommit = commit?.trim();
  const recordedCommit = entriesCommit === undefined || entriesCommit === '' ? {} : { entriesCommit };

  const list = payload.entries;
  if (list === undefined || list === null) {
    return recordedCommit;
  }
  const read = readChangeEntries(list);
  if ('defect' in read) {
    return read;
  }
  return { ...recordedCommit, ...(read.entries.length > 0 && { entries: read.entries }) };
}

/**
 * Reads the declared fields of one of the payload's groups into a record, reporting a group that is not a mapping or
 * the first field whose value has the wrong type. An absent or null group reads as empty.
 */
function readGroup(
  payload: Record<string, unknown>,
  name: 'consolidated_record' | 'overrides',
): { defect: string } | { record: ChangeRecord } {
  const mapping = payload[name];
  if (mapping === undefined || mapping === null) {
    return { record: {} };
  }
  if (!isRecord(mapping)) {
    return { defect: `\`${name}\` is not a mapping` };
  }
  const record: ChangeRecord = {};
  const { breaking } = mapping;
  if (breaking !== undefined && breaking !== null) {
    if (typeof breaking !== 'boolean') {
      return { defect: `\`${name}.breaking\` is not a boolean` };
    }
    record.breaking = breaking;
  }
  for (const key of STRING_FIELDS) {
    const value = mapping[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value !== 'string') {
      return { defect: `\`${name}.${key}\` is not a string` };
    }
    record[key] = value;
  }
  return { record };
}

/** Reads a parsed merge-form payload into the block that it records, reporting the first defect. */
function readMergePayload(payload: unknown): MergeChangeRecordBlockReading {
  if (!isRecord(payload)) {
    return { defect: 'the payload is not a mapping', kind: 'malformed' };
  }
  const { entries, pr_number: prNumber, ticket_ref: ticketRef } = payload;
  if (
    prNumber !== undefined &&
    prNumber !== null &&
    (typeof prNumber !== 'number' || !Number.isSafeInteger(prNumber) || prNumber <= 0)
  ) {
    return { defect: '`pr_number` is not a positive integer', kind: 'malformed' };
  }
  if (ticketRef !== undefined && ticketRef !== null && typeof ticketRef !== 'string') {
    return { defect: '`ticket_ref` is not a string', kind: 'malformed' };
  }

  const read = entries === undefined || entries === null ? { entries: [] } : readChangeEntries(entries);
  if ('defect' in read) {
    return { defect: read.defect, kind: 'malformed' };
  }
  const trimmedTicketRef = ticketRef?.trim();
  return {
    block: {
      entries: read.entries,
      ...(typeof prNumber === 'number' && { prNumber }),
      ...(trimmedTicketRef !== undefined && trimmedTicketRef !== '' && { ticketRef: trimmedTicketRef }),
    },
    kind: 'read',
  };
}

/** Reads a parsed payload into the block that it records, reporting the first key whose value the grammar does not allow. */
function readPayload(payload: unknown): ChangeRecordBlockReading {
  if (!isRecord(payload)) {
    return { defect: 'the payload is not a mapping', kind: 'malformed' };
  }
  const { title } = payload;
  if (title === undefined || title === null) {
    return { defect: '`title` is missing', kind: 'malformed' };
  }
  if (typeof title !== 'string') {
    return { defect: '`title` is not a string', kind: 'malformed' };
  }
  if (title.trim() === '') {
    return { defect: '`title` is empty', kind: 'malformed' };
  }

  const consolidatedFields = readGroup(payload, 'consolidated_record');
  if ('defect' in consolidatedFields) {
    return { defect: consolidatedFields.defect, kind: 'malformed' };
  }
  const overrideFields = readGroup(payload, 'overrides');
  if ('defect' in overrideFields) {
    return { defect: overrideFields.defect, kind: 'malformed' };
  }

  const consolidatedRecord = normalizeConsolidatedRecord(consolidatedFields.record);
  const { breaking, scope, type } = overrideFields.record;
  const overrides = normalizeOverrides({
    ...(breaking === true && { breaking }),
    ...(scope !== undefined && { scope }),
    ...(type !== undefined && { type }),
  });
  const entryFields = readEntryFields(payload);
  const recorded = 'defect' in entryFields ? {} : entryFields;
  return {
    block: {
      title: title.trim(),
      ...(Object.keys(consolidatedRecord).length > 0 && { consolidatedRecord }),
      ...(Object.keys(overrides).length > 0 && { overrides }),
      ...recorded,
    },
    ...('defect' in entryFields && { entriesDefect: entryFields.defect }),
    kind: 'read',
  };
}

/** Splits a text into lines, reading a CRLF line ending as a platform's web editor writes it. */
function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** The declared string fields of each group that the block contains. */
const STRING_FIELDS = ['scope', 'type'] as const;

/** Serializes the payload as YAML, rendering each entry's `scopes` in flow form. */
function stringifyPayload(payload: Record<string, unknown>): string {
  const document = new Document(payload);
  const entries = document.get('entries');
  if (isSeq(entries)) {
    for (const entry of entries.items) {
      const scopes = isMap(entry) ? entry.get('scopes', true) : undefined;
      if (isSeq(scopes)) {
        scopes.flow = true;
      }
    }
  }
  return document.toString({ flowCollectionPadding: false });
}

/**
 * Renders one change entry in the key order that `entry-drafter` returns it in, writing `breaking` only when it is true
 * and `migration` only when the entry has one.
 */
function toEntryPayload(entry: ChangeEntry): Record<string, unknown> {
  return {
    type: entry.type,
    scopes: entry.scopes,
    ...(entry.breaking && { breaking: true }),
    text: entry.text,
    ...(entry.migration !== undefined && { migration: entry.migration }),
  };
}

// endregion | Helpers
