/**
 * Removal of CodeAssembly-owned event-hook entries from a Rovo Dev `config.yml`. CodeAssembly owns individual items of
 * the `eventHooks.events` list, interleaved with foreign items written by other tools. Ownership is per-item,
 * identified by a caller-supplied sentinel matcher: A comment fence cannot delimit interleaved ownership. Every
 * function operates on a parsed `yaml` `Document` and mutates it in place via the comment-preserving Document API, so
 * foreign items, foreign comments, and unrelated keys survive untouched. File IO belongs to the caller.
 *
 * The schema is the one that real configs use: `eventHooks.events` is a YAML list of `{name, commands}` items, where
 * `name` is the hook event (several items may share one) and each `commands` item is a map containing a `command`
 * string. A map keyed by event name (the shape that some documentation describes) makes Rovo Dev treat the whole
 * config as corrupt. This module refuses it rather than modeling it.
 *
 * The module is agnostic about how the sentinel is encoded (a token in a command string, etc.); the caller fixes the
 * encoding and passes a matcher. The result shape comes from `managed-entry-contract.ts`, shared with the Claude
 * sibling.
 */

import { type Document, isMap, isSeq, type YAMLSeq } from 'yaml';

import type { RemoveResult } from './managed-entry-contract.ts';

/**
 * A single `eventHooks.events` item, mirroring the Rovo Dev shape: the hook event on which it fires, and its command
 * strings. In the file each command string is wrapped as a `{command}` map; this module unwraps it when reading. The
 * module never interprets command contents.
 */
export interface HookEntry {
  /** The hook event on which this entry fires (e.g. `on_session_start`). Not unique: foreign items may share it. */
  readonly name: string;
  readonly commands: readonly string[];
}

/** Identifies CodeAssembly-owned entries wherever they appear. Encoding is the caller's concern. */
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
 * Deletes every sentinel-matching item from the `eventHooks.events` list, then prunes structure that the deletion
 * emptied: An emptied `events` drops its key, and an `eventHooks` left empty drops too. An `eventHooks` still
 * containing other keys (`logFile`) survives. `removedCount` counts the owned items deleted.
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

/** Throws `RovoConfigParseError` when the document has parse errors, guarding every mutation and read. */
function assertParsable(doc: Document): void {
  const errorMessages = doc.errors.map((error) => error.message);
  if (errorMessages.length > 0) {
    throw new RovoConfigParseError(errorMessages);
  }
}

/**
 * Returns the `eventHooks.events` list, or undefined when `eventHooks` or `events` is missing. A present `events`
 * that is not a list (the map shape in particular) throws rather than reading as empty: Rovo Dev rejects such a
 * config as corrupt, and treating it as empty would hide whatever owned entries it contains.
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

/** True when the YAML item reads as a hook entry that the matcher claims. */
function isOwnedItem(item: unknown, isOwned: HookSentinelMatcher): boolean {
  const entry = readItem(item);
  return entry !== undefined && isOwned(entry);
}

/**
 * Reads a YAML list item as an entry, or undefined when it is not a well-formed entry: a map containing a string
 * `name` and a `commands` list whose every item is a map with a string `command`. Reading is lenient about extra keys:
 * An item carrying more than these keys must still be recognizable, or the ownership check would miss it.
 */
function readItem(item: unknown): HookEntry | undefined {
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
    if (!isMap(command)) {
      return undefined;
    }
    const value = command.get('command');
    if (typeof value !== 'string') {
      return undefined;
    }
    commandStrings.push(value);
  }
  return { name, commands: commandStrings };
}

// endregion | Helpers
