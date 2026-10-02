/**
 * Removal of CodeAssembly-owned hook entries from a parsed Claude Code `settings.json` value. An entry is one element of
 * a `hooks.{Event}` array (a matcher group) and is owned when any of its inner `hooks[].command` strings contains the
 * sentinel token. Owned entries are deleted as a unit; foreign entries, foreign events, and unrelated settings keys are
 * preserved. Every function is a pure transform that does not access the filesystem.
 */

import type { RemoveResult } from './managed-entry-contract.ts';
import { isRecord } from './type-guards.ts';

/** A transform's output: the resulting settings value paired with the operation's contract result. */
export interface HookEntriesTransform<TResult> {
  readonly settings: Record<string, unknown>;
  readonly result: TResult;
}

/**
 * Deletes every owned entry, whichever event holds it, and prunes the structure emptied by the deletion: An event
 * array left empty is dropped, and `hooks` is dropped once it does not hold any events. Ownership rests on the
 * sentinel alone, so an owned entry is deleted whatever its content. An event array that was already empty is foreign
 * content and survives.
 */
export function removeHookEntries(settings: unknown, sentinel: string): HookEntriesTransform<RemoveResult> {
  const root = readSettingsRoot(settings);
  const hooks = readHooks(root);
  const nextHooks: Record<string, unknown> = {};
  let removedCount = 0;

  for (const [event, groups] of Object.entries(hooks)) {
    const current = readEventGroups(hooks, event);
    const retained = current.filter((group) => !isOwnedGroup(group, sentinel));
    removedCount += current.length - retained.length;

    if (retained.length === current.length) {
      nextHooks[event] = groups;
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

/** True when a matcher group contains the sentinel in any of its commands: the ownership check. */
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

// endregion | Helpers
