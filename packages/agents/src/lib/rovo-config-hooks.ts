/**
 * Managed event-hook entries within a Rovo configuration file.
 * CodeAssembly owns individual `eventHooks` items scattered across several event arrays, which may be interleaved
 * with foreign items written by other tools.
 * Ownership is per-item, identified by a caller-supplied sentinel matcher rather than a contiguous region;
 * no comment fence can delimit interleaved ownership.
 * Every function operates on a parsed `yaml` `Document` and mutates it in place via the comment-preserving Document
 * API, so foreign items, foreign comments, and unrelated keys survive untouched. File IO belongs to the caller.
 *
 * The module is agnostic about how the sentinel is encoded (a token in a command, a metadata field, etc.); the caller
 * (the harness-wiring consumer) fixes the encoding and passes a matcher. It is also agnostic about how Rovo groups
 * items by event: Each supplied entry names the `eventKey` array it belongs in.
 */

import { type Document, isMap, isSeq, YAMLMap, YAMLSeq } from 'yaml';

/** A single `eventHooks` item, mirroring the Rovo shape. The module never interprets command contents. */
export interface HookEntry {
  readonly name: string;
  readonly commands: readonly string[];
}

/** An owned entry together with the event array it belongs in. */
export interface OwnedHookEntry {
  /** The `eventHooks.events` key whose array holds this entry (e.g. a lifecycle event name). */
  readonly eventKey: string;
  readonly entry: HookEntry;
}

/** Identifies CodeAssembly-owned entries wherever they sit. Encoding is the caller's concern. */
export type HookSentinelMatcher = (entry: HookEntry) => boolean;

/** Per-entry classification produced by {@link checkHookEntries}. */
export type HookEntryStatus = 'present' | 'drifted' | 'absent';

export interface HookEntryCheck {
  readonly eventKey: string;
  readonly name: string;
  readonly status: HookEntryStatus;
}

/** Thrown when an operation is asked to mutate a `Document` that failed to parse cleanly. */
export class RovoConfigParseError extends Error {
  readonly messages: readonly string[];

  constructor(messages: readonly string[]) {
    super(`Refusing to operate on a config.yml that failed to parse: ${messages.join('; ')}`);
    this.name = 'RovoConfigParseError';
    this.messages = messages;
  }
}

/** Classifies each owned entry against the document without mutating it. */
export function checkHookEntries(
  doc: Document,
  ownedHookEntries: readonly OwnedHookEntry[],
  isOwned: HookSentinelMatcher,
): HookEntryCheck[] {
  assertParsable(doc);

  return ownedHookEntries.map(({ eventKey, entry }) => {
    const events = getEventArray(doc, eventKey);
    const match = events ? findOwnedEntry(events, isOwned) : undefined;
    return { eventKey, name: entry.name, status: classify(match, entry) };
  });
}

/**
 * Inserts or replaces each owned entry in its event array, creating missing structure (`eventHooks`, `events`, the
 * event array) as needed. A sentinel-matching entry whose content differs is replaced in place; foreign neighbors and
 * ordering are preserved and no duplicate is appended. Returns true when the document changed, so the caller can drive
 * write-if-changed; an identical re-run returns false.
 */
export function ensureHookEntries(
  doc: Document,
  ownedHookEntries: readonly OwnedHookEntry[],
  isOwned: HookSentinelMatcher,
): boolean {
  assertParsable(doc);

  let changed = false;
  for (const { eventKey, entry } of ownedHookEntries) {
    const events = ensureEventArray(doc, eventKey);
    const desired = toYamlEntry(entry);
    const matchIndex = findOwnedIndex(events, isOwned);

    if (matchIndex === -1) {
      events.add(desired);
      changed = true;
      continue;
    }

    if (!areEntriesEqual(readEntry(events.items[matchIndex]), entry)) {
      events.items[matchIndex] = desired;
      changed = true;
    }
  }

  return changed;
}

/**
 * Deletes every sentinel-matching entry across all event arrays, then prunes structure the deletion emptied: an emptied
 * event array drops its key, an emptied `events` map drops it, and an emptied `eventHooks` drops that key. Structure
 * still holding foreign entries is left intact. Returns true when the document changed.
 */
export function removeHookEntries(doc: Document, isOwned: HookSentinelMatcher): boolean {
  assertParsable(doc);

  const events = getEventsMap(doc);
  if (!events) {
    return false;
  }

  let changed = false;
  const emptiedKeys: unknown[] = [];
  for (const pair of events.items) {
    const array = pair.value;
    if (!isSeq(array)) {
      continue;
    }

    const kept = array.items.filter((item) => !isOwnedItem(item, isOwned));
    if (kept.length === array.items.length) {
      continue;
    }

    changed = true;
    if (kept.length === 0) {
      emptiedKeys.push(pair.key);
    } else {
      array.items = kept;
    }
  }
  for (const key of emptiedKeys) {
    events.delete(key);
  }

  if (changed) {
    pruneEmptyContainers(doc, events);
  }

  return changed;
}

// region | Helpers

/** Structural equality of two entries: same name and same ordered command list. */
function areEntriesEqual(a: HookEntry | undefined, b: HookEntry): boolean {
  if (a === undefined) {
    return false;
  }
  return (
    a.name === b.name && a.commands.length === b.commands.length && a.commands.every((c, i) => c === b.commands[i])
  );
}

/** Throws {@link RovoConfigParseError} when the document carries parse errors, guarding every mutation and read. */
function assertParsable(doc: Document): void {
  if (doc.errors.length > 0) {
    throw new RovoConfigParseError(doc.errors.map((error) => error.message));
  }
}

/** Classifies an owned entry against its desired form. */
function classify(match: HookEntry | undefined, desired: HookEntry): HookEntryStatus {
  if (match === undefined) {
    return 'absent';
  }
  return areEntriesEqual(match, desired) ? 'present' : 'drifted';
}

/** Returns the `eventHooks.events` array for `eventKey`, creating `eventHooks`, `events`, and the array as needed. */
function ensureEventArray(doc: Document, eventKey: string): YAMLSeq {
  const existing = getEventArray(doc, eventKey);
  if (existing) {
    return existing;
  }

  const array = new YAMLSeq();
  doc.setIn(['eventHooks', 'events', eventKey], array);
  return array;
}

/** Returns the `eventHooks.events` array for `eventKey`, or undefined when any level is missing or malformed. */
function getEventArray(doc: Document, eventKey: string): YAMLSeq | undefined {
  const events = getEventsMap(doc);
  if (!events) {
    return undefined;
  }
  const array = events.get(eventKey, true);
  return isSeq(array) ? array : undefined;
}

/** Returns the `eventHooks.events` map, or undefined when either level is missing or malformed. */
function getEventsMap(doc: Document): YAMLMap | undefined {
  const events = doc.getIn(['eventHooks', 'events'], true);
  return isMap(events) ? events : undefined;
}

/** The first owned entry in the array as a plain {@link HookEntry}, or undefined. */
function findOwnedEntry(array: YAMLSeq, isOwned: HookSentinelMatcher): HookEntry | undefined {
  const item = array.items.find((candidate) => isOwnedItem(candidate, isOwned));
  return item === undefined ? undefined : readEntry(item);
}

/** Index of the first owned item in the array, or -1. */
function findOwnedIndex(array: YAMLSeq, isOwned: HookSentinelMatcher): number {
  return array.items.findIndex((item) => isOwnedItem(item, isOwned));
}

/** True when the YAML item reads as a hook entry the matcher claims. */
function isOwnedItem(item: unknown, isOwned: HookSentinelMatcher): boolean {
  const entry = readEntry(item);
  return entry !== undefined && isOwned(entry);
}

/** The string value of a scalar node or plain string, or undefined for anything else. */
function isScalarString(node: unknown): string | undefined {
  if (typeof node === 'string') {
    return node;
  }
  if (node !== null && typeof node === 'object' && 'value' in node && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}

/** Drops `events` when it holds no arrays and `eventHooks` when it holds nothing but an emptied `events`. */
function pruneEmptyContainers(doc: Document, events: YAMLMap): void {
  if (events.items.length > 0) {
    return;
  }
  doc.deleteIn(['eventHooks', 'events']);

  const eventHooks = doc.get('eventHooks', true);
  if (isMap(eventHooks) && eventHooks.items.length === 0) {
    doc.delete('eventHooks');
  }
}
/** Reads a YAML seq item into a {@link HookEntry}, or undefined when it is not a well-formed entry. */
function readEntry(item: unknown): HookEntry | undefined {
  if (!isMap(item)) {
    return undefined;
  }
  const name = item.get('name');
  const commands = item.get('commands', true);
  if (typeof name !== 'string' || !isSeq(commands)) {
    return undefined;
  }
  const commandStrings: string[] = [];
  for (const command of commands.items) {
    const value = isScalarString(command);
    if (value === undefined) {
      return undefined;
    }
    commandStrings.push(value);
  }
  return { name, commands: commandStrings };
}

/** Builds a fresh YAML map for an entry. Owned items are rebuilt as a unit; their inner comments are not preserved. */
function toYamlEntry(entry: HookEntry): YAMLMap {
  const map = new YAMLMap();
  map.set('name', entry.name);
  const commands = new YAMLSeq();
  for (const command of entry.commands) {
    commands.add(command);
  }
  map.set('commands', commands);
  return map;
}

// endregion | Helpers
