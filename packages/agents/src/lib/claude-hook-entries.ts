/**
 * Idempotent management of codeassembly-owned hook entries within a parsed Claude Code `settings.json` value. An entry
 * is one element of a `hooks.{Event}` array — a matcher group — and is owned when any of its inner `hooks[].command`
 * strings carries the sentinel token. Owned entries are replaced or deleted as a unit; foreign entries, foreign events,
 * and unrelated settings keys are preserved. Every function is a pure transform with no filesystem access.
 */

import { isDeepStrictEqual } from 'node:util';

import type { EnsureResult, EntryCheck, RemoveResult } from './managed-entry-contract.ts';
import { isRecord } from './type-guards.ts';

/** One managed hook entry: the `hooks.{Event}` array it belongs to, and the matcher group written into that array. */
export interface ClaudeHookEntry {
  readonly event: string;
  readonly group: Record<string, unknown>;
}

/** A transform's output: the resulting settings value paired with the operation's contract result. */
export interface HookEntriesTransform<TResult> {
  readonly settings: Record<string, unknown>;
  readonly result: TResult;
}

/**
 * Reports each supplied entry as `present` (an owned entry under its event is deep-equal to it), `drifted` (its event
 * holds owned entries but none match), or `absent` (its event holds no owned entry). Deep equality ignores key order,
 * so a re-serialized file never reads as drift.
 */
export function checkHookEntries(
  settings: unknown,
  entries: ReadonlyArray<ClaudeHookEntry>,
  sentinel: string,
): ReadonlyArray<EntryCheck<ClaudeHookEntry>> {
  const hooks = readHooks(settings);

  return entries.map((entry) => {
    const owned = readEventGroups(hooks, entry.event).filter((group) => isOwnedGroup(group, sentinel));
    if (owned.some((group) => isDeepStrictEqual(group, entry.group))) {
      return { entry, status: 'present' };
    }
    return { entry, status: owned.length > 0 ? 'drifted' : 'absent' };
  });
}

/**
 * Installs `entries` into their `hooks.{Event}` arrays, creating whatever structure is missing. Per event, the owned
 * subset of the array is replaced wholesale by the supplied entries for that event — spliced in at the first owned
 * position, appended when the event holds none. That is what makes a re-run a no-op, collapses accidental duplicates
 * into the supplied set, and leaves foreign entries in their original relative order.
 *
 * Throws when a supplied entry does not itself carry the sentinel: an entry written without it could never be found
 * again by `checkHookEntries` or `removeHookEntries`.
 */
export function ensureHookEntries(
  settings: unknown,
  entries: ReadonlyArray<ClaudeHookEntry>,
  sentinel: string,
): HookEntriesTransform<EnsureResult> {
  for (const entry of entries) {
    if (!isOwnedGroup(entry.group, sentinel)) {
      throw new Error(
        `Refusing to write a hook entry for '${entry.event}' whose commands do not carry the sentinel '${sentinel}'; ` +
          'an entry without it could not be found again.',
      );
    }
  }

  const root = readSettingsRoot(settings);
  const hooks = readHooks(root);
  const nextHooks = { ...hooks };
  let changed = false;

  for (const [event, eventEntries] of groupEntriesByEvent(entries)) {
    const current = readEventGroups(hooks, event);
    const next = replaceOwnedGroups(
      current,
      eventEntries.map((entry) => entry.group),
      sentinel,
    );
    if (!isDeepStrictEqual(current, next)) {
      nextHooks[event] = next;
      changed = true;
    }
  }

  if (!changed) {
    return { settings: root, result: { changed: false } };
  }
  return { settings: { ...root, hooks: nextHooks }, result: { changed: true } };
}

/**
 * Deletes every owned entry, whichever event holds it, and prunes the structure the deletion emptied: an event array
 * left with no entries is dropped, and `hooks` is dropped once it holds no events. Takes only the sentinel, so it also
 * reaches entries written by earlier versions. An event array that was already empty is foreign content and survives.
 */
export function removeHookEntries(settings: unknown, sentinel: string): HookEntriesTransform<RemoveResult> {
  const root = readSettingsRoot(settings);
  const hooks = readHooks(root);
  const nextHooks: Record<string, unknown> = {};
  let removedCount = 0;

  for (const event of Object.keys(hooks)) {
    const current = readEventGroups(hooks, event);
    const retained = current.filter((group) => !isOwnedGroup(group, sentinel));
    removedCount += current.length - retained.length;

    if (retained.length === current.length) {
      nextHooks[event] = hooks[event];
    } else if (retained.length > 0) {
      nextHooks[event] = retained;
    }
  }

  if (removedCount === 0) {
    return { settings: root, result: { changed: false, removedCount: 0 } };
  }

  const next: Record<string, unknown> = { ...root };
  if (Object.keys(nextHooks).length === 0) {
    delete next.hooks;
  } else {
    next.hooks = nextHooks;
  }
  return { settings: next, result: { changed: true, removedCount } };
}

// region | Helpers

/** Collects the entries for each event, preserving the supplied order within an event and across events. */
function groupEntriesByEvent(entries: ReadonlyArray<ClaudeHookEntry>): Map<string, Array<ClaudeHookEntry>> {
  const byEvent = new Map<string, Array<ClaudeHookEntry>>();
  for (const entry of entries) {
    const eventEntries = byEvent.get(entry.event) ?? [];
    eventEntries.push(entry);
    byEvent.set(entry.event, eventEntries);
  }
  return byEvent;
}

/** True when a matcher group carries the sentinel in any of its commands — the ownership check. */
function isOwnedGroup(group: unknown, sentinel: string): boolean {
  if (!isRecord(group) || !Array.isArray(group.hooks)) {
    return false;
  }
  return group.hooks.some(
    (hook: unknown) => isRecord(hook) && typeof hook.command === 'string' && hook.command.includes(sentinel),
  );
}

/** Reads an event's matcher groups, treating an absent event as empty and refusing a non-array value. */
function readEventGroups(hooks: Record<string, unknown>, event: string): ReadonlyArray<unknown> {
  const groups = hooks[event];
  if (groups === undefined) {
    return [];
  }
  if (!Array.isArray(groups)) {
    throw new TypeError(`Expected 'hooks.${event}' in the Claude settings to be an array, but it is not.`);
  }
  return groups;
}

/** Reads the `hooks` map, treating an absent key as empty and refusing a non-object value. */
function readHooks(settings: unknown): Record<string, unknown> {
  const hooks = readSettingsRoot(settings).hooks;
  if (hooks === undefined) {
    return {};
  }
  if (!isRecord(hooks)) {
    throw new TypeError("Expected 'hooks' in the Claude settings to be an object, but it is not.");
  }
  return hooks;
}

/** Narrows the parsed settings value to an object, refusing an array or scalar document. */
function readSettingsRoot(settings: unknown): Record<string, unknown> {
  if (!isRecord(settings)) {
    throw new TypeError('Expected the Claude settings to be a JSON object, but they are not.');
  }
  return settings;
}

/**
 * Rebuilds an event array with `groups` standing in for its owned entries: they take the first owned position, or the
 * end of the array when the event holds no owned entry. Everything preceding the first owned entry is foreign by
 * construction, so only the tail needs filtering.
 */
function replaceOwnedGroups(
  current: ReadonlyArray<unknown>,
  groups: ReadonlyArray<Record<string, unknown>>,
  sentinel: string,
): Array<unknown> {
  const firstOwned = current.findIndex((group) => isOwnedGroup(group, sentinel));
  if (firstOwned === -1) {
    return [...current, ...groups];
  }
  const tail = current.slice(firstOwned + 1).filter((group) => !isOwnedGroup(group, sentinel));
  return [...current.slice(0, firstOwned), ...groups, ...tail];
}

// endregion | Helpers
