import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { resolveEventsDir } from '@williamthorsen/kb/layout';
import { readNote } from '@williamthorsen/kb/note-io';
import { type KbEvent, parseEvent } from '@williamthorsen/kb/records';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEnoent } from '../lib/type-guards.ts';
import { findLatestDeferral } from './deferral.ts';
import type { Inventory, InventoryEntry, SkippedEvent } from './types.ts';

/** The tag that marks an event as feedback on agent guidance. */
const FEEDBACK_TAG = 'feedback';

/** The tag that marks an event that an earlier triage set aside. */
const DEFERRED_TAG = 'deferred';

/** The standard disposition tags that take an event out of consideration for good. */
const CLOSED_TAGS: ReadonlySet<string> = new Set(['obsolete', 'rejected']);

/** The longest excerpt, in characters, that the clusterer receives for one event. */
export const EXCERPT_LIMIT = 400;

/**
 * Reads every event in the store and returns the feedback events that a clustering pass groups. The pool contains the
 * events not addressed by anything; `deferred` contains the events whose only references are triage artifacts that
 * deferred them. An event file that does not parse is reported in `skipped` rather than failing the inventory.
 */
export async function buildInventory(input: { storeName: string; storePath: string }): Promise<Inventory> {
  const eventsDir = resolveEventsDir(input.storePath);
  const files = await listEventFiles(eventsDir);

  const pool: InventoryEntry[] = [];
  const deferred: InventoryEntry[] = [];
  const skipped: SkippedEvent[] = [];

  for (const file of files) {
    const filePath = path.join(eventsDir, file);
    const loaded = await loadEvent(filePath);
    if (!loaded.ok) {
      skipped.push({ file: filePath, message: loaded.message });
      continue;
    }
    const event = loaded.event;
    if (!event.tags.includes(FEEDBACK_TAG) || event.tags.some((tag) => CLOSED_TAGS.has(tag))) {
      continue;
    }
    if (event.addressedBy.length === 0) {
      pool.push(toEntry(event));
      continue;
    }
    if (!event.tags.includes(DEFERRED_TAG)) {
      continue;
    }
    const deferredAt = findLatestDeferral(event.addressedBy);
    if (deferredAt !== null) {
      deferred.push({ ...toEntry(event), deferredAt });
    }
  }

  return { store: input.storeName, pool, deferred, skipped };
}

/** Returns the first paragraph of `body`, with its whitespace collapsed, cut to {@link EXCERPT_LIMIT} characters. */
export function buildExcerpt(body: string): string {
  const paragraph =
    body
      .trim()
      .split(/\n\s*\n/, 1)[0]
      ?.replaceAll(/\s+/g, ' ') ?? '';
  return paragraph.length <= EXCERPT_LIMIT ? paragraph : `${paragraph.slice(0, EXCERPT_LIMIT - 1)}…`;
}

// region | Helpers

/** Lists the store's event files in name order, which is capture order for ULID ids; a missing directory is empty. */
async function listEventFiles(eventsDir: string): Promise<string[]> {
  try {
    const names = await readdir(eventsDir);
    return names.filter((name) => name.endsWith('.md')).toSorted();
  } catch (error) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }
}

/** Reads and parses one event file, mapping a read or validation defect onto a message. */
async function loadEvent(filePath: string): Promise<{ ok: true; event: KbEvent } | { ok: false; message: string }> {
  let read;
  try {
    read = await readNote(filePath);
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }
  if (read.error !== undefined) {
    return { ok: false, message: read.error };
  }
  const parsed = parseEvent(read.fields, read.body);
  return parsed.ok ? { ok: true, event: parsed.record } : { ok: false, message: parsed.errors.join('; ') };
}

/** Projects an event onto the fields that the clusterer reads. */
function toEntry(event: KbEvent): InventoryEntry {
  const skill = readExtraString(event, 'skill');
  const repo = readExtraString(event, 'repo');
  return {
    id: event.id,
    summary: event.summary,
    ...(skill !== undefined && { skill }),
    ...(repo !== undefined && { repo }),
    capturedAt: event.capturedAt,
    ...(event.impact !== undefined && { impact: event.impact }),
    excerpt: buildExcerpt(event.body),
  };
}

/** Returns a string field from the event's undeclared frontmatter, or `undefined` when it is absent or not a string. */
function readExtraString(event: KbEvent, key: string): string | undefined {
  const value = event.extra[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

// endregion | Helpers
