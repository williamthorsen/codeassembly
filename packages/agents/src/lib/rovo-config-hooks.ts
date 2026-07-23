/**
 * Managed event-hook entries within a Rovo Dev `config.yml`. CodeAssembly owns individual items of the
 * `eventHooks.events` list, interleaved with foreign items written by other tools. Ownership is per-item, identified by
 * a caller-supplied sentinel matcher — no comment fence can delimit interleaved ownership. Every function operates on a
 * parsed `yaml` `Document` and mutates it in place via the comment-preserving Document API, so foreign items, foreign
 * comments, and unrelated keys survive untouched. File IO belongs to the caller.
 *
 * The schema is the one real configs use, verified against a live config and a hook experiment: `eventHooks.events` is
 * a YAML list of `{name, commands}` items, where `name` is the hook event (several items may share one) and each
 * `commands` item is a map carrying a `command` string. A map keyed by event name — the shape some documentation
 * describes — makes Rovo Dev treat the whole config as corrupt, so this module refuses it rather than modeling it.
 *
 * The module is agnostic about how the sentinel is encoded (a token in a command string, etc.); the caller fixes the
 * encoding and passes a matcher. The ensure/check/remove shapes come from `managed-entry-contract.ts`, shared with the
 * Claude sibling so the harness wiring stays uniform.
 */

import { type Document, isMap, isSeq, YAMLMap, YAMLSeq } from 'yaml';

import type { EnsureResult, EntryCheck, ManagedEntryStatus, RemoveResult } from './managed-entry-contract.ts';

/**
 * A single `eventHooks.events` item, mirroring the Rovo Dev shape: the hook event it fires on, and its command
 * strings. In the file each command string is wrapped as a `{command}` map; this module owns that translation. The
 * module never interprets command contents.
 */
export interface HookEntry {
  /** The hook event this entry fires on (e.g. `on_session_start`). Not unique: foreign items may share it. */
  readonly name: string;
  readonly commands: readonly string[];
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
 * Reports each supplied entry as `present` (an owned item with its name is equal to it), `drifted` (an owned item with
 * its name differs, or owned items exist under other names only), or `absent` (no owned item anywhere). The report is
 * scoped to the entries supplied; an all-present result does not imply ensure would leave the document unchanged,
 * since ensure would still drop an owned item the caller did not supply.
 */
export function checkHookEntries(
  doc: Document,
  entries: readonly HookEntry[],
  isOwned: HookSentinelMatcher,
): ReadonlyArray<EntryCheck<HookEntry>> {
  assertParsable(doc);

  const array = getEventsList(doc);
  const owned = array ? readOwnedItems(array, isOwned) : [];
  return entries.map((entry) => ({ entry, status: classify(owned, entry) }));
}

/**
 * Installs `entries` into the `eventHooks.events` list, creating missing structure (`eventHooks`, `events`) as needed.
 * The owned subset of the list is replaced wholesale by the supplied entries — spliced in at the first owned position,
 * appended when the list holds none. That is what makes a re-run a no-op, replaces drifted entries in place, collapses
 * accidental duplicates into the supplied set, and leaves foreign items in their original relative order. `changed` is
 * false when nothing moved.
 *
 * Throws when a supplied entry does not itself satisfy the matcher: an entry written without the sentinel could never
 * be found again by check or remove.
 */
export function ensureHookEntries(
  doc: Document,
  entries: readonly HookEntry[],
  isOwned: HookSentinelMatcher,
): EnsureResult {
  assertParsable(doc);
  assertAllOwned(entries, isOwned);

  if (entries.length === 0 && getEventsList(doc) === undefined) {
    return { changed: false };
  }
  return { changed: replaceOwnedItems(ensureEventsList(doc), entries, isOwned) };
}

/**
 * Deletes every sentinel-matching item from the `eventHooks.events` list, then prunes structure the deletion emptied:
 * an emptied `events` drops its key, and an `eventHooks` left holding nothing drops too. An `eventHooks` still holding
 * other keys (`logFile`) survives. `removedCount` counts the owned items deleted.
 */
export function removeHookEntries(doc: Document, isOwned: HookSentinelMatcher): RemoveResult {
  assertParsable(doc);

  const array = getEventsList(doc);
  if (!array) {
    return { changed: false, removedCount: 0 };
  }

  const kept = array.items.filter((item) => !isOwnedItem(item, isOwned));
  const removedCount = array.items.length - kept.length;
  if (removedCount === 0) {
    return { changed: false, removedCount: 0 };
  }

  if (kept.length > 0) {
    array.items = kept;
  } else {
    doc.deleteIn(['eventHooks', 'events']);
    const eventHooks = doc.get('eventHooks', true);
    if (isMap(eventHooks) && eventHooks.items.length === 0) {
      doc.delete('eventHooks');
    }
  }

  return { changed: true, removedCount };
}

// region | Helpers

/** Throws when a supplied entry fails the matcher, since an unsentineled entry could never be found again. */
function assertAllOwned(entries: readonly HookEntry[], isOwned: HookSentinelMatcher): void {
  for (const entry of entries) {
    if (!isOwned(entry)) {
      throw new Error(
        `Refusing to write a hook entry '${entry.name}' that the sentinel matcher does not claim; ` +
          'an entry without the sentinel could not be found again.',
      );
    }
  }
}

/** Throws {@link RovoConfigParseError} when the document carries parse errors, guarding every mutation and read. */
function assertParsable(doc: Document): void {
  const errorMessages = doc.errors.map((error) => error.message);
  if (errorMessages.length > 0) {
    throw new RovoConfigParseError(errorMessages);
  }
}

/**
 * Classifies a desired entry against the owned items present, matched by name: `present` needs an equal, pristine
 * match; an owned item under its name that differs — or owned items under other names only — is `drifted`; no owned
 * item anywhere is `absent`.
 */
function classify(owned: readonly ReadItem[], desired: HookEntry): ManagedEntryStatus {
  const match = owned.find((item) => item.entry.name === desired.name);
  if (match === undefined) {
    return owned.length > 0 ? 'drifted' : 'absent';
  }
  return match.pristine && entriesEqual(match.entry, desired) ? 'present' : 'drifted';
}

/** Structural equality of two entries: same name and same ordered command list. */
function entriesEqual(a: HookEntry, b: HookEntry): boolean {
  return (
    a.name === b.name && a.commands.length === b.commands.length && a.commands.every((c, i) => c === b.commands[i])
  );
}

/** Returns the `eventHooks.events` list, creating `eventHooks` and `events` as needed. */
function ensureEventsList(doc: Document): YAMLSeq {
  const existing = getEventsList(doc);
  if (existing) {
    return existing;
  }

  const array = new YAMLSeq();
  doc.setIn(['eventHooks', 'events'], array);
  return array;
}

/**
 * Returns the `eventHooks.events` list, or undefined when `eventHooks` or `events` is missing. A present `events`
 * that is not a list — the map shape in particular — throws rather than reading as empty: Rovo Dev rejects such a
 * config as corrupt, and treating it as empty would append entries the CLI never runs.
 */
function getEventsList(doc: Document): YAMLSeq | undefined {
  const events = doc.getIn(['eventHooks', 'events'], true);
  if (events === undefined) {
    return undefined;
  }
  if (!isSeq(events)) {
    throw new TypeError("Expected 'eventHooks.events' in the Rovo config to be a list, but it is not.");
  }
  return events;
}

/** True when the YAML item reads as a hook entry the matcher claims. */
function isOwnedItem(item: unknown, isOwned: HookSentinelMatcher): boolean {
  const read = readItem(item);
  return read !== undefined && isOwned(read.entry);
}

/** True when the current owned items match the desired entries in order, each pristine and equal. */
function ownedItemsEqual(current: readonly ReadItem[], desired: readonly HookEntry[]): boolean {
  if (current.length !== desired.length) {
    return false;
  }
  return current.every((item, index) => {
    const target = desired[index];
    return target !== undefined && item.pristine && entriesEqual(item.entry, target);
  });
}

/**
 * A YAML item read back as an entry. `pristine` records that every command map carried only the `command` key; a
 * hand-added extra key (a timeout, say) must read as drift, not as an equal entry, so ensure rebuilds it and check
 * reports it honestly.
 */
interface ReadItem {
  readonly entry: HookEntry;
  readonly pristine: boolean;
}

/**
 * Reads a YAML list item into a {@link ReadItem}, or undefined when it is not a well-formed entry: a map holding a
 * string `name` and a `commands` list whose every item is a map with a string `command`. Reading is lenient about
 * extra keys — a foreign item carrying more than this module writes must still be recognizable, or ownership checks
 * would go blind to it.
 */
function readItem(item: unknown): ReadItem | undefined {
  if (!isMap(item)) {
    return undefined;
  }
  const name = item.get('name');
  const commands = item.get('commands', true);
  if (typeof name !== 'string' || !isSeq(commands)) {
    return undefined;
  }

  const commandStrings: string[] = [];
  let pristine = item.items.length === 2;
  for (const command of commands.items) {
    if (!isMap(command)) {
      return undefined;
    }
    const value = command.get('command');
    if (typeof value !== 'string') {
      return undefined;
    }
    commandStrings.push(value);
    pristine &&= command.items.length === 1;
  }
  return { entry: { name, commands: commandStrings }, pristine };
}

/** The owned items in the list, in order. */
function readOwnedItems(array: YAMLSeq, isOwned: HookSentinelMatcher): ReadItem[] {
  const owned: ReadItem[] = [];
  for (const item of array.items) {
    const read = readItem(item);
    if (read !== undefined && isOwned(read.entry)) {
      owned.push(read);
    }
  }
  return owned;
}

/**
 * Replaces the owned subset of the events list with `entries`: the supplied set is spliced in at the first owned
 * position (appended when the list holds none), other owned items are dropped, and foreign items keep their order.
 * Returns whether the list changed.
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
  const before = array.items
    .slice(firstOwned)
    .map(readItem)
    .filter((read): read is ReadItem => read !== undefined && isOwned(read.entry));

  if (ownedItemsEqual(before, entries)) {
    return false;
  }

  array.items = [...head, ...desired, ...tail];
  return true;
}

/**
 * Builds a fresh YAML map for an entry, wrapping each command string as a `{command}` map per the file shape. Owned
 * items are rebuilt as a unit; their inner comments are not preserved.
 */
function toYamlEntry(entry: HookEntry): YAMLMap {
  const map = new YAMLMap();
  map.set('name', entry.name);
  const commands = new YAMLSeq();
  for (const command of entry.commands) {
    const commandMap = new YAMLMap();
    commandMap.set('command', command);
    commands.add(commandMap);
  }
  map.set('commands', commands);
  return map;
}

// endregion | Helpers
