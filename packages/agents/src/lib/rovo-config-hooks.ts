/**
 * Managed event-hook entries within a Rovo Dev `config.yml`. CodeAssembly owns individual `eventHooks` items scattered
 * across several event arrays, interleaved with foreign items written by other tools. Ownership is per-item, identified
 * by a caller-supplied sentinel matcher rather than a contiguous region — no comment fence can delimit interleaved
 * ownership. Every function operates on a parsed `yaml` `Document` and mutates it in place via the comment-preserving
 * Document API, so foreign items, foreign comments, and unrelated keys survive untouched. File IO belongs to the caller.
 *
 * The module is agnostic about how the sentinel is encoded (a token in a command, a metadata field, etc.); the caller
 * (the harness-wiring consumer) fixes the encoding and passes a matcher. It is also agnostic about how Rovo Dev groups
 * items by event: each supplied entry names the `eventKey` array it belongs in.
 *
 * The ensure/check/remove shapes come from `managed-entry-contract.ts`, shared with the Claude sibling so #1005 wires
 * both harnesses uniformly.
 */

import { type Document, isMap, isSeq, YAMLMap, YAMLSeq } from 'yaml';

import type { EnsureResult, EntryCheck, ManagedEntryStatus, RemoveResult } from './managed-entry-contract.ts';

/** A single `eventHooks` item, mirroring the Rovo Dev shape. The module never interprets command contents. */
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

/** Thrown when an operation is asked to mutate a `Document` that failed to parse cleanly. */
export class RovoConfigParseError extends Error {
  readonly messages: readonly string[];

  constructor(messages: readonly string[]) {
    super(`Refusing to operate on a config.yml that failed to parse: ${messages.join('; ')}`);
    this.name = 'RovoConfigParseError';
    this.messages = messages;
  }
}

/**
 * Installs each owned entry into its event array, creating missing structure (`eventHooks`, `events`, the event array)
 * as needed. Per event, the owned subset of the array is replaced wholesale by the supplied entries for that event,
 * matched by `name`: a re-run is a no-op, a drifted owned entry is replaced in place, accidental duplicates collapse to
 * the supplied set, and foreign entries keep their relative order. `changed` is false when nothing moved.
 *
 * Throws when a supplied entry does not itself satisfy the matcher: an entry written without the sentinel could never
 * be found again by check or remove.
 */
export function ensureHookEntries(
  doc: Document,
  ownedHookEntries: readonly OwnedHookEntry[],
  isOwned: HookSentinelMatcher,
): EnsureResult {
  assertParsable(doc);
  assertAllOwned(ownedHookEntries, isOwned);

  let changed = false;
  for (const [eventKey, entries] of groupByEvent(ownedHookEntries)) {
    const array = ensureEventArray(doc, eventKey);
    if (replaceOwnedItems(array, entries, isOwned)) {
      changed = true;
    }
  }

  return { changed };
}

/**
 * Reports each supplied entry as `present` (an owned entry under its event is equal to it), `drifted` (its event holds
 * owned entries but none matches), or `absent` (its event holds no owned entry). The report is scoped to the entries
 * supplied; an all-present result does not imply ensure would leave the document unchanged, since ensure would still
 * drop an owned entry the caller did not supply.
 */
export function checkHookEntries(
  doc: Document,
  ownedHookEntries: readonly OwnedHookEntry[],
  isOwned: HookSentinelMatcher,
): ReadonlyArray<EntryCheck<OwnedHookEntry>> {
  assertParsable(doc);

  return ownedHookEntries.map((owned) => {
    const array = getEventArray(doc, owned.eventKey);
    const ownedEntries = array ? readOwnedEntries(array, isOwned) : [];
    return { entry: owned, status: classify(ownedEntries, owned.entry) };
  });
}

/**
 * Deletes every sentinel-matching entry across all event arrays, then prunes structure the deletion emptied: an emptied
 * event array drops its key, an emptied `events` map drops it, and an emptied `eventHooks` drops that key. Structure
 * still holding foreign entries is left intact. `removedCount` counts the owned entries deleted.
 */
export function removeHookEntries(doc: Document, isOwned: HookSentinelMatcher): RemoveResult {
  assertParsable(doc);

  const events = getEventsMap(doc);
  if (!events) {
    return { changed: false, removedCount: 0 };
  }

  let removedCount = 0;
  const emptiedKeys: unknown[] = [];
  for (const pair of events.items) {
    const array = pair.value;
    if (!isSeq(array)) {
      continue;
    }

    const kept = array.items.filter((item) => !isOwnedItem(item, isOwned));
    const removed = array.items.length - kept.length;
    if (removed === 0) {
      continue;
    }

    removedCount += removed;
    if (kept.length === 0) {
      emptiedKeys.push(pair.key);
    } else {
      array.items = kept;
    }
  }

  if (removedCount === 0) {
    return { changed: false, removedCount: 0 };
  }

  for (const key of emptiedKeys) {
    events.delete(key);
  }
  pruneEmptyContainers(doc, events);

  return { changed: true, removedCount };
}

// region | Helpers

/** Throws {@link RovoConfigParseError} when the document carries parse errors, guarding every mutation and read. */
function assertParsable(doc: Document): void {
  if (doc.errors.length > 0) {
    throw new RovoConfigParseError(doc.errors.map((error) => error.message));
  }
}

/** Throws when a supplied entry fails the matcher, since an unsentineled entry could never be found again. */
function assertAllOwned(ownedHookEntries: readonly OwnedHookEntry[], isOwned: HookSentinelMatcher): void {
  for (const { eventKey, entry } of ownedHookEntries) {
    if (!isOwned(entry)) {
      throw new Error(
        `Refusing to write a hook entry '${entry.name}' for '${eventKey}' that the sentinel matcher does not claim; ` +
          'an entry without the sentinel could not be found again.',
      );
    }
  }
}

/** Collects the entries for each event, preserving the supplied order within an event and across events. */
function groupByEvent(ownedHookEntries: readonly OwnedHookEntry[]): Map<string, HookEntry[]> {
  const grouped = new Map<string, HookEntry[]>();
  for (const { eventKey, entry } of ownedHookEntries) {
    const existing = grouped.get(eventKey);
    if (existing) {
      existing.push(entry);
    } else {
      grouped.set(eventKey, [entry]);
    }
  }
  return grouped;
}

/**
 * Replaces the owned subset of an event array with `entries`, matched by name: the supplied set is spliced in at the
 * first owned position (appended when the array holds none), other owned items are dropped, and foreign items keep
 * their order. Returns whether the array changed.
 */
function replaceOwnedItems(array: YAMLSeq, entries: readonly HookEntry[], isOwned: HookSentinelMatcher): boolean {
  const firstOwned = array.items.findIndex((item) => isOwnedItem(item, isOwned));
  const desired = entries.map(toYamlEntry);

  if (firstOwned === -1) {
    if (desired.length === 0) {
      return false;
    }
    array.items.push(...desired);
    return true;
  }

  const head = array.items.slice(0, firstOwned);
  const tail = array.items.slice(firstOwned + 1).filter((item) => !isOwnedItem(item, isOwned));
  const before = array.items.slice(firstOwned).filter((item) => isOwnedItem(item, isOwned));

  if (ownedItemsEqual(before, entries)) {
    return false;
  }

  array.items = [...head, ...desired, ...tail];
  return true;
}

/** True when the current owned items match the desired entries in order, by name and command list. */
function ownedItemsEqual(current: readonly unknown[], desired: readonly HookEntry[]): boolean {
  if (current.length !== desired.length) {
    return false;
  }
  return current.every((item, index) => {
    const entry = readEntry(item);
    const target = desired[index];
    return entry !== undefined && target !== undefined && entriesEqual(entry, target);
  });
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

/** The owned entries in an array, in order, as plain {@link HookEntry} values. */
function readOwnedEntries(array: YAMLSeq, isOwned: HookSentinelMatcher): HookEntry[] {
  const owned: HookEntry[] = [];
  for (const item of array.items) {
    const entry = readEntry(item);
    if (entry !== undefined && isOwned(entry)) {
      owned.push(entry);
    }
  }
  return owned;
}

/** True when the YAML item reads as a hook entry the matcher claims. */
function isOwnedItem(item: unknown, isOwned: HookSentinelMatcher): boolean {
  const entry = readEntry(item);
  return entry !== undefined && isOwned(entry);
}

/** Classifies a desired entry against the owned entries present under its event, matched by name. */
function classify(ownedEntries: readonly HookEntry[], desired: HookEntry): ManagedEntryStatus {
  const match = ownedEntries.find((entry) => entry.name === desired.name);
  if (match === undefined) {
    return ownedEntries.length > 0 ? 'drifted' : 'absent';
  }
  return entriesEqual(match, desired) ? 'present' : 'drifted';
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
    const value = scalarString(command);
    if (value === undefined) {
      return undefined;
    }
    commandStrings.push(value);
  }
  return { name, commands: commandStrings };
}

/** Structural equality of two entries: same name and same ordered command list. */
function entriesEqual(a: HookEntry, b: HookEntry): boolean {
  return (
    a.name === b.name && a.commands.length === b.commands.length && a.commands.every((c, i) => c === b.commands[i])
  );
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

/** The string value of a scalar node or plain string, or undefined for anything else. */
function scalarString(node: unknown): string | undefined {
  if (typeof node === 'string') {
    return node;
  }
  if (node !== null && typeof node === 'object' && 'value' in node && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}

// endregion | Helpers
