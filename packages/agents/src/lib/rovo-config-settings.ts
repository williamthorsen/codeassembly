/**
 * The file layer over the Rovo Dev hook-entry transforms: read and parse `config.yml`, delegate to the pure transform,
 * and write the mutated document back, so foreign entries, foreign comments, and unrelated keys reach disk exactly as
 * the comment-preserving transform left them. The path is supplied by the caller, which resolves it per harness. A
 * file that cannot be parsed is reported and never written.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { type Document, parseDocument } from 'yaml';

import type { EnsureResult, EntryCheck, RemoveResult } from './managed-entry-contract.ts';
import {
  checkHookEntries,
  ensureHookEntries,
  type HookEntry,
  type HookSentinelMatcher,
  removeHookEntries,
} from './rovo-config-hooks.ts';
import { isEnoent } from './type-guards.ts';

/** Reports each supplied entry's status in the config file. A file that does not exist reports every entry absent. */
export async function checkRovoHookEntries(
  filePath: string,
  entries: readonly HookEntry[],
  isOwned: HookSentinelMatcher,
): Promise<ReadonlyArray<EntryCheck<HookEntry>>> {
  const doc = await readConfigDocument(filePath);
  return checkHookEntries(doc, entries, isOwned);
}

/**
 * Installs `entries` into the config file, creating the file and its parent directory when absent. The file is
 * rewritten only when the entries were missing or drifted, so a re-run leaves its mtime alone.
 */
export async function ensureRovoHookEntries(
  filePath: string,
  entries: readonly HookEntry[],
  isOwned: HookSentinelMatcher,
): Promise<EnsureResult> {
  const doc = await readConfigDocument(filePath);
  const result = ensureHookEntries(doc, entries, isOwned);
  if (result.changed) {
    await writeConfigDocument(filePath, doc);
  }
  return result;
}

/** Deletes every sentinel-matching entry from the config file. A file that does not exist is left uncreated. */
export async function removeRovoHookEntries(filePath: string, isOwned: HookSentinelMatcher): Promise<RemoveResult> {
  const doc = await readConfigDocument(filePath);
  const result = removeHookEntries(doc, isOwned);
  if (result.changed) {
    await writeConfigDocument(filePath, doc);
  }
  return result;
}

// region | Helpers

/**
 * Reads and parses the config file; an absent file reads as an empty document. A file that parses with errors throws
 * here, naming the file, so no operation ever mutates or rewrites a document the parser could not fully understand.
 */
async function readConfigDocument(filePath: string): Promise<Document> {
  const text = await readConfigText(filePath);
  const doc = parseDocument(text ?? '');
  if (doc.errors.length > 0) {
    const details = doc.errors.map((error) => error.message).join('; ');
    throw new Error(`Cannot parse ${filePath} as YAML: ${details}`);
  }
  return doc;
}

/** Reads the file as UTF-8, returning undefined when it does not exist. */
async function readConfigText(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Writes the document, creating the parent directory as needed. Line wrapping is disabled so a long hook command stays
 * one line rather than being folded across several — parse-equivalent, but unreadable and noisy in diffs.
 */
async function writeConfigDocument(filePath: string, doc: Document): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, doc.toString({ lineWidth: 0 }), 'utf8');
}

// endregion | Helpers
