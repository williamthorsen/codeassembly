/* eslint n/no-process-exit: off -- CLI script: a usage error and a refused store each exit with a status of their own. */
/* eslint unicorn/no-process-exit: off -- CLI script: a usage error and a refused store each exit with a status of their own. */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';

import { resolveStore } from '../src/cli/resolve-store.ts';
import { resolveEventsDir } from '../src/layout/store-layout.ts';
import { readNoteContent } from '../src/note-io/read-note.ts';

const FENCE = '---';
const MILLISECOND_CAPTURED_AT = /^captured-at: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d+Z$/;
const USAGE = `Usage: node packages/kb/scripts/truncate-millisecond-captured-at.ts [--kb <name>] [--write]

Truncate the fractional seconds of every event's millisecond captured-at in a store, leaving every other byte of
each file unchanged. Without --write, report the changes and write nothing.

Options:
  --kb <name>  Migrate the named store from the kb.yaml registry. Without it, the nearest ancestor .kb/ directory is used.
  --write      Write the changes.
  -h, --help   Show this help.`;

/** One rewritten `captured-at`: the note's path relative to the store, and its value before and after. */
export interface CapturedAtChange {
  path: string;
  before: string;
  after: string;
}

/** The outcome of a store migration: the changes made, or would be made in a dry run, or a failure message. */
export type MigrateStoreOutcome =
  { ok: true; storePath: string; changes: CapturedAtChange[] } | { ok: false; message: string };

/**
 * Applies {@link truncateMillisecondCapturedAt} to every note in a store's events directory, writing the results only
 * when `write` is set. Refuses to write into a store that the registry marks readonly.
 */
export async function migrateStore(input: {
  kb: string | null;
  write: boolean;
  cwd: string;
  home?: string;
}): Promise<MigrateStoreOutcome> {
  const resolved = await resolveStore({
    explicitKb: input.kb,
    cwd: input.cwd,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (!resolved.ok) {
    return resolved;
  }
  if (input.write && resolved.readonly) {
    return { ok: false, message: `the store at ${resolved.store.path} is readonly` };
  }

  const storePath = resolved.store.path;
  const eventsDir = resolveEventsDir(storePath);
  const names = (await readdir(eventsDir)).filter((name) => name.endsWith('.md')).toSorted();
  const changes: CapturedAtChange[] = [];
  for (const name of names) {
    const path = join(eventsDir, name);
    const rewrite = truncateMillisecondCapturedAt(await readFile(path, 'utf8'));
    if (rewrite === undefined) {
      continue;
    }
    if (input.write) {
      await writeFile(path, rewrite.content, 'utf8');
    }
    changes.push({ path: relative(storePath, path), before: rewrite.before, after: rewrite.after });
  }
  return { ok: true, storePath, changes };
}

/**
 * Truncates an event note's millisecond `captured-at` to second precision, changing only that line of the frontmatter
 * block. Returns `undefined` when the note is not a parseable event or its `captured-at` is not in millisecond form.
 */
export function truncateMillisecondCapturedAt(
  content: string,
): { content: string; before: string; after: string } | undefined {
  const note = readNoteContent(content);
  if (note.error !== undefined || note.fields['recordType'] !== 'event') {
    return undefined;
  }
  const lines = content.split('\n');
  const endIndex = lines.findIndex((line, index) => index > 0 && line === FENCE);
  const index = lines.findIndex(
    (line, lineIndex) => lineIndex > 0 && lineIndex < endIndex && line.startsWith('captured-at:'),
  );
  const match = index === -1 ? null : MILLISECOND_CAPTURED_AT.exec(lines[index] ?? '');
  const seconds = match?.[1];
  if (seconds === undefined) {
    return undefined;
  }
  const before = (lines[index] ?? '').slice('captured-at: '.length);
  const after = `${seconds}Z`;
  lines[index] = `captured-at: ${after}`;
  return { content: lines.join('\n'), before, after };
}

if (import.meta.main) {
  await runCli(process.argv.slice(2));
}

// region | Helpers

/** Parses the arguments, runs the migration, and prints one line per change followed by a count. */
async function runCli(args: readonly string[]): Promise<void> {
  let kb: string | null = null;
  let write = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-h' || arg === '--help') {
      console.info(USAGE);
      return;
    }
    if (arg === '--write') {
      write = true;
    } else if (arg === '--kb' && args[index + 1] !== undefined) {
      kb = args[index + 1] ?? null;
      index += 1;
    } else {
      console.error(`Unknown or incomplete argument: ${arg ?? ''}\n\n${USAGE}`);
      process.exit(2);
    }
  }

  const outcome = await migrateStore({ kb, write, cwd: process.cwd() });
  if (!outcome.ok) {
    console.error(outcome.message);
    process.exit(2);
  }
  const verb = write ? 'rewrote' : 'would rewrite';
  for (const change of outcome.changes) {
    console.info(`${verb} ${change.path}: ${change.before} -> ${change.after}`);
  }
  console.info(`${outcome.changes.length} ${write ? 'rewritten' : 'to rewrite'} in ${outcome.storePath}`);
}

// endregion | Helpers
