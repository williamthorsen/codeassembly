/**
 * The file layer over the Claude Code hook-entry removal transform: read and parse `settings.json`, delegate to the pure
 * transform, and write the result back in the file's own formatting. The path is supplied by the caller, which resolves
 * it per harness. A file that cannot be parsed is reported and never written.
 */

import { readFile, writeFile } from 'node:fs/promises';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import { removeHookEntries } from './claude-hook-entries.ts';
import type { RemoveResult } from './managed-entry-contract.ts';
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

/** The indent unit given to a multi-line document that does not contain an indented line. */
const DEFAULT_INDENT = 2;

/**
 * Deletes from the settings file every entry that contains the sentinel. A file that does not exist is left uncreated.
 * Under `dryRun`, reports what the removal would delete and leaves the file unwritten.
 */
export async function removeClaudeHookEntries(
  filePath: string,
  sentinel: string,
  options: { readonly dryRun?: boolean } = {},
): Promise<RemoveResult> {
  const file = await readSettingsFile(filePath);
  if (file === undefined) {
    return { changed: false, removedCount: 0 };
  }
  const { settings, result } = removeHookEntries(file.value, sentinel);
  if (result.changed && options.dryRun !== true) {
    await writeSettingsFile(filePath, settings, file.format);
  }
  return result;
}

// region | Helpers

/** Reads the indent unit from the first indented line; a single-line document demonstrates compact style and keeps it. */
function detectIndent(body: string): string | number {
  const unit = /\n([ \t]+)\S/.exec(body)?.[1];
  if (unit !== undefined) {
    return unit;
  }
  return body.includes('\n') ? DEFAULT_INDENT : 0;
}

/** Reads the indent unit and trailing-newline habit from a settings file's text. */
function detectJsonFormat(text: string): JsonFormat {
  const trailingNewline = text.endsWith('\n');
  return { indent: detectIndent(trailingNewline ? text.slice(0, -1) : text), trailingNewline };
}

/** Parses the file text, naming the file in the failure so that the caller can report which one needs fixing. */
function parseSettings(text: string, filePath: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error: unknown) {
    throw chainError(`Cannot parse ${filePath} as JSON`, error);
  }
}

/** Reads and parses the settings file, returning undefined when it does not exist. */
async function readSettingsFile(filePath: string): Promise<SettingsFile | undefined> {
  const text = await readSettingsText(filePath);
  if (text === undefined) {
    return undefined;
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

/** Serializes the settings in the detected formatting. */
function renderSettings(settings: Record<string, unknown>, format: JsonFormat): string {
  return JSON.stringify(settings, undefined, format.indent) + (format.trailingNewline ? '\n' : '');
}

/**
 * Writes the settings in the file's own formatting, in place: A settings file that is a symlink stays a symlink, with
 * its target updated, which is the shape that a dotfiles-managed setup takes. The write is not atomic, so an
 * interrupted write leaves a document that Claude Code rejects as a whole.
 */
async function writeSettingsFile(
  filePath: string,
  settings: Record<string, unknown>,
  format: JsonFormat,
): Promise<void> {
  await writeFile(filePath, renderSettings(settings, format), 'utf8');
}

// endregion | Helpers
