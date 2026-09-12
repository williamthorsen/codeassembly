import { parseDocument, stringify as stringifyYaml } from 'yaml';

import { normalizeChangeRecord } from '../change-grammar/tokens.ts';
import type { ChangeRecord } from '../change-grammar/types.ts';
import { isRecord } from '../lib/type-guards.ts';

/**
 * Reads the last `change-record` block in a pull-request body back into what it records, as the inverse of
 * `renderChangeRecordBlock`: the body carries no block, carries one that cannot be read, or carries one that reads.
 *
 * `head` and `overrides` normalize as the renderer normalizes them, so a scope override of `*` is kept. A key the
 * grammar does not declare is ignored, so a later addition to the block does not break this reader, and a declared key
 * whose value is null reads as absent.
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
 * Renders the fenced `change-record` block a pull-request body carries as its final block: the head the branch
 * consolidated to, and any override the author applied.
 *
 * The payload is YAML rather than a surface template, because `head` and `overrides` nest and a template renders one
 * flat line. Its inverse is a YAML parse rather than a compiled pattern, so the pair needs no round-trip verification
 * of the kind the title grammar requires.
 *
 * `head` and `overrides` are normalized as the engine normalizes any record, so a field the branch did not determine is
 * absent rather than empty, a marker spelled on a type splits into the type and `breaking`, and `breaking` appears only
 * where it is true.
 */
export function renderChangeRecordBlock(block: ChangeRecordBlock): string {
  const overrides = normalizeOverrides(block.overrides ?? {});
  const payload = {
    head: normalizeChangeRecord(block.head),
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

/** What the block records: the derived head and the overrides the author applied. */
export interface ChangeRecordBlock {
  head: ChangeRecord;
  overrides?: RecordOverrides;
}

/** What a body's last `change-record` block reads as: absent, malformed with the defect named, or the block it records. */
export type ChangeRecordBlockReading =
  { kind: 'absent' } | { defect: string; kind: 'malformed' } | { block: ChangeRecordBlock; kind: 'read' };

/**
 * The dimensions an author may override, named as the flags that set them are. A `scope` of `*` sets no scope.
 * `breaking` is only ever `true`: an override can add the marker to a head but not remove it.
 */
export interface RecordOverrides {
  breaking?: true;
  scope?: string;
  type?: string;
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

/** Reads a parsed payload into the block it records, reporting the first key whose value the grammar does not allow. */
function readPayload(payload: unknown): ChangeRecordBlockReading {
  if (!isRecord(payload)) {
    return { defect: 'the payload is not a mapping', kind: 'malformed' };
  }
  const { head, overrides } = payload;
  if (!isRecord(head)) {
    return { defect: '`head` is not a mapping', kind: 'malformed' };
  }
  if (overrides !== undefined && overrides !== null && !isRecord(overrides)) {
    return { defect: '`overrides` is not a mapping', kind: 'malformed' };
  }

  const headFields = readRecordFields(head, 'head');
  if ('defect' in headFields) {
    return { defect: headFields.defect, kind: 'malformed' };
  }
  const overrideFields = readRecordFields(isRecord(overrides) ? overrides : {}, 'overrides');
  if ('defect' in overrideFields) {
    return { defect: overrideFields.defect, kind: 'malformed' };
  }

  const { breaking, scope, type } = overrideFields.record;
  const normalizedOverrides = normalizeOverrides({
    ...(breaking === true && { breaking }),
    ...(scope !== undefined && { scope }),
    ...(type !== undefined && { type }),
  });
  return {
    block: {
      head: normalizeChangeRecord(headFields.record),
      ...(Object.keys(normalizedOverrides).length > 0 && { overrides: normalizedOverrides }),
    },
    kind: 'read',
  };
}

/** Reads the declared fields of one mapping into a record, reporting the first whose value has the wrong type. */
function readRecordFields(
  mapping: Record<string, unknown>,
  name: keyof typeof STRING_FIELDS,
): { defect: string } | { record: ChangeRecord } {
  const record: ChangeRecord = {};
  const { breaking } = mapping;
  if (breaking !== undefined && breaking !== null) {
    if (typeof breaking !== 'boolean') {
      return { defect: `\`${name}.breaking\` is not a boolean` };
    }
    record.breaking = breaking;
  }
  const keys = STRING_FIELDS[name];
  for (const key of keys) {
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

/** Splits a text into lines, reading a CRLF line ending as a platform's web editor writes it. */
function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** The declared string fields of each mapping the block holds. */
const STRING_FIELDS = { head: ['scope', 'title', 'type'], overrides: ['scope', 'type'] } as const;

// endregion | Helpers
