/**
 * The file layer over the Rovo Dev hook-entry removal transform: read and parse `config.yml`, delegate to the pure
 * transform, and write the mutated document back, so foreign entries, foreign comments, and unrelated keys are written
 * to disk exactly as the comment-preserving transform left them. The path is supplied by the caller, which resolves it
 * per harness. A file that cannot be parsed is reported and never written.
 */

import { readFile, writeFile } from 'node:fs/promises';

import { type Document, parseDocument } from 'yaml';

import type { RemoveResult } from './managed-entry-contract.ts';
import { type HookSentinelMatcher, removeHookEntries } from './rovo-config-hooks.ts';
import { isEnoent } from './type-guards.ts';

/**
 * Deletes every sentinel-matching entry from the config file. A file that does not exist is left uncreated. Under
 * `dryRun`, reports what the removal would delete and leaves the file unwritten.
 */
export async function removeRovoHookEntries(
  filePath: string,
  isOwned: HookSentinelMatcher,
  options: { readonly dryRun?: boolean } = {},
): Promise<RemoveResult> {
  const doc = await readConfigDocument(filePath);
  const result = removeHookEntries(doc, isOwned);
  if (result.changed && options.dryRun !== true) {
    await writeConfigDocument(filePath, doc);
  }
  return result;
}

// region | Helpers

/**
 * Reads and parses the config file; an absent file reads as an empty document. A file that parses with errors throws
 * here, naming the file, so an operation never mutates or rewrites a document that the parser could not fully
 * understand.
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
 * Writes the document. Line wrapping is disabled so that a long hook command stays one line rather than being folded
 * across several (parse-equivalent, but unreadable and noisy in diffs).
 */
async function writeConfigDocument(filePath: string, doc: Document): Promise<void> {
  await writeFile(filePath, doc.toString({ lineWidth: 0 }), 'utf8');
}

// endregion | Helpers
