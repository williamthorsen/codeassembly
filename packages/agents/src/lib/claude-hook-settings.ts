/**
 * The file layer over the Claude Code hook-entry transforms: read and parse `settings.json`, delegate to the pure
 * transform, and write the result back in the file's own formatting. The path is supplied by the caller, which resolves
 * it per harness. A file that cannot be parsed is reported and never written.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import { checkHookEntries, type ClaudeHookEntry, ensureHookEntries, removeHookEntries } from './claude-hook-entries.ts';
import type { EnsureResult, EntryCheck, RemoveResult } from './managed-entry-contract.ts';
import { isEnoent } from './type-guards.ts';

/** The formatting to reproduce when writing a settings file back: the indent unit, and whether the file ends in one. */
interface JsonFormat {
  readonly indent: string | number;
  readonly trailingNewline: boolean;
}

/** A settings file as read: its parsed value, and the formatting detected from its text. */
interface SettingsFile {
  readonly value: unknown;
  readonly format: JsonFormat;
}

/** The formatting a settings file created from scratch is given. */
const DEFAULT_FORMAT: JsonFormat = { indent: 2, trailingNewline: true };

/** Reports each supplied entry's status in the settings file. A file that does not exist reports every entry absent. */
export async function checkClaudeHookEntries(
  filePath: string,
  entries: ReadonlyArray<ClaudeHookEntry>,
  sentinel: string,
): Promise<ReadonlyArray<EntryCheck<ClaudeHookEntry>>> {
  const { value } = await readSettingsFile(filePath);
  return checkHookEntries(value, entries, sentinel);
}

/**
 * Installs `entries` into the settings file, creating the file and its parent directory when absent. The file is
 * rewritten only when the entries were missing or drifted, so a re-run leaves its mtime alone.
 */
export async function ensureClaudeHookEntries(
  filePath: string,
  entries: ReadonlyArray<ClaudeHookEntry>,
  sentinel: string,
): Promise<EnsureResult> {
  const { value, format } = await readSettingsFile(filePath);
  const { settings, result } = ensureHookEntries(value, entries, sentinel);
  if (result.changed) {
    await writeSettingsFile(filePath, settings, format);
  }
  return result;
}

/** Deletes every sentinel-carrying entry from the settings file. A file that does not exist is left uncreated. */
export async function removeClaudeHookEntries(filePath: string, sentinel: string): Promise<RemoveResult> {
  const { value, format } = await readSettingsFile(filePath);
  const { settings, result } = removeHookEntries(value, sentinel);
  if (result.changed) {
    await writeSettingsFile(filePath, settings, format);
  }
  return result;
}

// region | Helpers

/**
 * Reads the indent unit from the first indented line. A single-line document holding members demonstrates compact style
 * and keeps it; a document with no members demonstrates nothing, so it takes the default that a missing file takes.
 */
function detectIndent(body: string): string | number {
  const unit = /\n([ \t]+)\S/.exec(body)?.[1];
  if (unit !== undefined) {
    return unit;
  }
  const isEmptyDocument = /^\{\s*\}$/.test(body.trim());
  return !isEmptyDocument && !body.includes('\n') ? 0 : DEFAULT_FORMAT.indent;
}

function detectJsonFormat(text: string): JsonFormat {
  const trailingNewline = text.endsWith('\n');
  return { indent: detectIndent(trailingNewline ? text.slice(0, -1) : text), trailingNewline };
}

/** Parses the file text, naming the file in the failure so the caller can report which one needs fixing. */
function parseSettings(text: string, filePath: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error: unknown) {
    throw chainError(`Cannot parse ${filePath} as JSON`, error);
  }
}

/** Reads and parses the settings file; an absent file reads as empty settings in the default formatting. */
async function readSettingsFile(filePath: string): Promise<SettingsFile> {
  const text = await readSettingsText(filePath);
  if (text === undefined) {
    return { value: {}, format: DEFAULT_FORMAT };
  }
  return { value: parseSettings(text, filePath), format: detectJsonFormat(text) };
}

/** Reads the file as UTF-8, returning undefined when it does not exist. */
async function readSettingsText(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return undefined;
    }
    throw error;
  }
}

function renderSettings(settings: Record<string, unknown>, format: JsonFormat): string {
  return JSON.stringify(settings, undefined, format.indent) + (format.trailingNewline ? '\n' : '');
}

/**
 * Writes the settings in the file's own formatting, in place: a settings file that is a symlink stays a symlink, with
 * its target updated, which is the shape a dotfiles-managed setup takes. The write is not atomic, so an interrupted
 * write leaves a document Claude Code rejects as a whole.
 */
async function writeSettingsFile(
  filePath: string,
  settings: Record<string, unknown>,
  format: JsonFormat,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, renderSettings(settings, format), 'utf8');
}

// endregion | Helpers
