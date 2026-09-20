import { consolidate } from '../change-grammar/consolidate.ts';
import type { ChangeRecord, Taxonomy } from '../change-grammar/types.ts';
import { isRecord } from '../lib/type-guards.ts';

/**
 * Consolidates a change's entries into the record that represents the change.
 *
 * Each entry expands to one record per scope, and an entry naming no scope expands to one record with no scope, so a
 * change touching nothing scoped stays rankable on its type. The expanded list is ranked by `consolidate`, which
 * resolves the scope by union-singleton and the type by rank, so the change entries and the commit entries consolidate
 * under one rule. An entry whose type the taxonomy does not declare is unrankable, and `consolidate` skips it.
 */
export function consolidateChangeEntries(entries: readonly ChangeEntry[], taxonomy: Taxonomy): ChangeRecord {
  const expanded = entries.flatMap((entry) => {
    const record: ChangeRecord = { ...(entry.breaking && { breaking: true }), type: entry.type };
    return entry.scopes.length === 0 ? [record] : entry.scopes.map((scope) => ({ ...record, scope }));
  });
  return consolidate(expanded, taxonomy);
}

/**
 * Reads a parsed YAML value into the change entries that it declares, reporting the first item that the grammar does
 * not allow.
 *
 * The value is a list of mappings, in the shape that `entry-drafter` returns. `scopes` and `breaking` are optional and
 * read as empty and false; `type` and `text` are required, since an entry missing either records nothing. A key that
 * the grammar does not declare is ignored, and a declared key whose value is null reads as absent.
 */
export function readChangeEntries(value: unknown): ChangeEntriesReading {
  if (!Array.isArray(value)) {
    return { defect: 'the entries are not a list' };
  }
  const entries: ChangeEntry[] = [];
  for (const [index, item] of value.entries()) {
    const read = readEntry(item, index);
    if ('defect' in read) {
      return read;
    }
    entries.push(read.entry);
  }
  return { entries };
}

/** What a change's entry list reads as: the entries that it declares, or the defect that stopped the read. */
export type ChangeEntriesReading = { defect: string } | { entries: ChangeEntry[] };

/**
 * One outcome of a change, as `entry-drafter` returns it: the work type that it takes, the scopes that it touched, its
 * breaking marker, and the sentence that reports it.
 */
export interface ChangeEntry {
  breaking: boolean;
  scopes: string[];
  text: string;
  type: string;
}

// region | Helpers

/** Reads one item of the list into an entry, naming the item by its index in every defect. */
function readEntry(item: unknown, index: number): { defect: string } | { entry: ChangeEntry } {
  const at = `entries[${index}]`;
  if (!isRecord(item)) {
    return { defect: `\`${at}\` is not a mapping` };
  }

  const { breaking, scopes } = item;
  if (breaking !== undefined && breaking !== null && typeof breaking !== 'boolean') {
    return { defect: `\`${at}.breaking\` is not a boolean` };
  }
  if (scopes !== undefined && scopes !== null && !Array.isArray(scopes)) {
    return { defect: `\`${at}.scopes\` is not a list` };
  }
  const declared: unknown[] = scopes ?? [];
  const read: string[] = [];
  for (const [position, scope] of declared.entries()) {
    if (typeof scope !== 'string') {
      return { defect: `\`${at}.scopes[${position}]\` is not a string` };
    }
    read.push(scope.trim());
  }

  const text = readRequiredField(item, at, 'text');
  if ('defect' in text) {
    return text;
  }
  const type = readRequiredField(item, at, 'type');
  if ('defect' in type) {
    return type;
  }

  return {
    entry: { breaking: breaking === true, scopes: read, text: text.value, type: type.value },
  };
}

/** Reads a string field that every entry declares, refusing one that is absent, of the wrong type, or blank. */
function readRequiredField(
  item: Record<string, unknown>,
  at: string,
  name: 'text' | 'type',
): { defect: string } | { value: string } {
  const value = item[name];
  if (value === undefined || value === null) {
    return { defect: `\`${at}.${name}\` is missing` };
  }
  if (typeof value !== 'string') {
    return { defect: `\`${at}.${name}\` is not a string` };
  }
  const trimmed = value.trim();
  return trimmed === '' ? { defect: `\`${at}.${name}\` is empty` } : { value: trimmed };
}

// endregion | Helpers
