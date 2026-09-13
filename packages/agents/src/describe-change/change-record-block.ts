import { parseDocument, stringify as stringifyYaml } from 'yaml';

import type { Overrides } from '../change-grammar/apply-overrides.ts';
import { normalizeChangeRecord } from '../change-grammar/tokens.ts';
import type { ChangeRecord } from '../change-grammar/types.ts';
import { isRecord } from '../lib/type-guards.ts';

/**
 * Reads the last `change-record` block in a pull-request body back into what it records, as the inverse of
 * `renderChangeRecordBlock`: the body carries no block, carries one that cannot be read, or carries one that reads.
 *
 * A block without a `title` does not read. `consolidated_record` and `overrides` normalize as the renderer normalizes
 * them, so a scope override of `*` is kept. A key the grammar does not declare is ignored, so a later addition to the
 * block does not break this reader, and a declared key whose value is null reads as absent.
 */
export function readChangeRecordBlock(body: string): ChangeRecordBlockReading {
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
  const payload: unknown = document.toJS();
  return readPayload(payload);
}

/**
 * Renders the fenced `change-record` block that a pull-request body carries as its final block: the title, the
 * consolidated record of the branch, and any override the author applied.
 *
 * The payload is YAML rather than a surface template, because `consolidated_record` and `overrides` nest and a template
 * renders one flat line. Its inverse is a YAML parse rather than a compiled pattern, so the pair needs no round-trip
 * verification of the kind the title grammar requires.
 *
 * The consolidated record and the overrides are normalized as the engine normalizes any record, so a field that the
 * branch did not determine is absent rather than empty, a marker spelled on a type splits into the type and `breaking`,
 * and `breaking` appears only where it is true. Each group is omitted where it is empty.
 */
export function renderChangeRecordBlock(block: ChangeRecordBlock): string {
  const consolidatedRecord = normalizeConsolidatedRecord(block.consolidatedRecord ?? {});
  const overrides = normalizeOverrides(block.overrides ?? {});
  const payload = {
    title: block.title.trim(),
    ...(Object.keys(consolidatedRecord).length > 0 && { consolidated_record: consolidatedRecord }),
    ...(Object.keys(overrides).length > 0 && { overrides }),
  };
  return `${FENCE}${INFO_STRING}\n${stringifyYaml(payload)}${FENCE}`;
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
 * What the block records: the title, the consolidated record of the branch, and the overrides that the author applied.
 * Only the scope, type, and breaking marker of `consolidatedRecord` are recorded.
 */
export interface ChangeRecordBlock {
  consolidatedRecord?: ChangeRecord;
  overrides?: RecordOverrides;
  title: string;
}

/** What a body's last `change-record` block reads as: absent, malformed with the defect named, or the block it records. */
export type ChangeRecordBlockReading =
  { kind: 'absent' } | { defect: string; kind: 'malformed' } | { block: ChangeRecordBlock; kind: 'read' };

/**
 * The overrides that a block records, named as the flags that set them are. A `scope` of `*` sets no scope. `breaking`
 * is only ever `true`: a block's override can add the marker to a record but not remove it.
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

/** Reads a parsed payload into the block it records, reporting the first key whose value the grammar does not allow. */
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
  return {
    block: {
      title: title.trim(),
      ...(Object.keys(consolidatedRecord).length > 0 && { consolidatedRecord }),
      ...(Object.keys(overrides).length > 0 && { overrides }),
    },
    kind: 'read',
  };
}

/** Splits a text into lines, reading a CRLF line ending as a platform's web editor writes it. */
function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** The declared string fields of each group that the block holds. */
const STRING_FIELDS = ['scope', 'type'] as const;

// endregion | Helpers
