/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { isEnoent, isRecord } from '../lib/type-guards.ts';
import { COPY_PROBE_SCRIPT } from './copy-probe.ts';
import { fail } from './failure.ts';
import { isValidSlug, listLatestEntries, readManifest, resolveIds, writeManifest } from './manifest.ts';
import { parseArgs, type ParsedArgs, parseInputs, requireFlag, resolveSetDir } from './parse-args.ts';
import { isWebUrl, register } from './register.ts';
import { type IndexCard, PAGE_LIMIT_BYTES, PAGE_WARN_BYTES, renderIndexPage } from './render-index.ts';
import type { IndexPrototypesResult, SetSummary } from './types.ts';

/** Executes the helper from `process.argv`, writing the JSON result to stdout and exiting non-zero on a failure. */
async function main(): Promise<void> {
  try {
    const result = await runIndexPrototypes({ argv: process.argv.slice(2), now: new Date() });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`index-prototypes: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, 'index-prototypes')) {
  await main();
}

/**
 * Runs one command of the helper. On a recoverable failure, returns `{ ok: false, error, message }` without writing
 * anything; a system failure (out of disk, permission denied) propagates.
 *
 * @internal - Exported to allow testing.
 */
export async function runIndexPrototypes(input: {
  argv: readonly string[];
  now: Date;
}): Promise<IndexPrototypesResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(input.argv);
  } catch (error) {
    return fail('invalid-args', describeError(error));
  }

  switch (args.command) {
    case 'copy-probe':
      return { ok: true, command: 'copy-probe', function: COPY_PROBE_SCRIPT };
    case 'describe-set':
      return describeSet(resolveSetDir(args.values), path.resolve(requireFlag(args.values, 'file')));
    case 'record-index':
      return recordIndex(resolveSetDir(args.values), requireFlag(args.values, 'url'));
    case 'register':
      return register(resolveSetDir(args.values), args.values, args.notes, input.now);
    case 'render':
      return render(resolveSetDir(args.values), path.resolve(requireFlag(args.values, 'out')));
    case 'resolve-ids':
      return resolveIdsForSlugs(resolveSetDir(args.values), requireFlag(args.values, 'slugs'));
    default: {
      const _exhaustive: never = args.command;
      throw new Error(`unhandled command: ${String(_exhaustive)}`);
    }
  }
}

// region | Helpers

/** Replaces the set's summary with the one in the JSON file at `filePath`. */
async function describeSet(setDir: string, filePath: string): Promise<IndexPrototypesResult> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return fail('summary-not-found', `${filePath} does not exist`);
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('invalid-summary', `${filePath} is not valid JSON`);
  }
  const summary = parseSummary(parsed);
  if (typeof summary === 'string') {
    return fail('invalid-summary', `${filePath}: ${summary}`);
  }

  const read = await readManifest(setDir);
  if (read.kind === 'missing') {
    return fail('manifest-not-found', `${setDir} does not contain a manifest; register a prototype first`);
  }
  if (read.kind === 'invalid') {
    return fail('invalid-manifest', read.message);
  }
  const manifestPath = await writeManifest(setDir, { ...read.manifest, summary });
  return { ok: true, command: 'describe-set', manifestPath, summary };
}

/**
 * Returns the trimmed summary in a parsed summary file, or a message naming its defect. `changes` may be absent, and an
 * absent or blank `changes` reads as `null`.
 */
function parseSummary(value: unknown): SetSummary | string {
  if (!isRecord(value)) {
    return 'expected an object with "shared", "changes", and "try"';
  }
  const { shared, changes, try: tryItems } = value;
  if (typeof shared !== 'string' || shared.trim() === '') {
    return '"shared" must be a non-empty string';
  }
  if (changes !== undefined && changes !== null && typeof changes !== 'string') {
    return '"changes" must be a string or null';
  }
  if (!Array.isArray(tryItems) || tryItems.some((item) => !(typeof item === 'string' && item.trim() !== ''))) {
    return '"try" must be a list of non-empty strings';
  }
  const trimmedChanges = typeof changes === 'string' ? changes.trim() : '';
  return {
    shared: shared.trim(),
    changes: trimmedChanges === '' ? null : trimmedChanges,
    try: tryItems.map((item: string) => item.trim()),
  };
}

/** Reads a stored screenshot, returning `null` when the file is missing. */
async function readShot(shotPath: string): Promise<Buffer | null> {
  try {
    return await readFile(shotPath);
  } catch (error) {
    if (isEnoent(error)) {
      return null;
    }
    throw error;
  }
}

/** Records the published index page's URL in the set's manifest. */
async function recordIndex(setDir: string, url: string): Promise<IndexPrototypesResult> {
  if (!isWebUrl(url)) {
    return fail('invalid-url', `--url "${url}" is not an http or https URL`);
  }
  const read = await readManifest(setDir);
  if (read.kind === 'missing') {
    return fail('manifest-not-found', `${setDir} does not contain a manifest; register a prototype first`);
  }
  if (read.kind === 'invalid') {
    return fail('invalid-manifest', read.message);
  }
  const manifestPath = await writeManifest(setDir, { ...read.manifest, indexUrl: url });
  return { ok: true, command: 'record-index', manifestPath, indexUrl: url };
}

/**
 * Renders the set's index page from the latest version of each slug and writes it to `outPath`, refusing a page over
 * the artifact cap. A recorded screenshot that is missing from disk renders as the placeholder and is reported.
 */
async function render(setDir: string, outPath: string): Promise<IndexPrototypesResult> {
  const read = await readManifest(setDir);
  if (read.kind === 'missing') {
    return fail('manifest-not-found', `${setDir} does not contain a manifest; register a prototype first`);
  }
  if (read.kind === 'invalid') {
    return fail('invalid-manifest', read.message);
  }
  const { manifest } = read;

  const cards: IndexCard[] = [];
  const missingShots: string[] = [];
  for (const entry of listLatestEntries(manifest)) {
    const shot = entry.shot === null ? null : await readShot(path.join(setDir, entry.shot));
    if (entry.shot !== null && shot === null) {
      missingShots.push(entry.slug);
    }
    cards.push({ entry, shot });
  }

  const page = renderIndexPage({ title: manifest.title, summary: manifest.summary, cards });
  const bytes = Buffer.byteLength(page, 'utf8');
  if (bytes > PAGE_LIMIT_BYTES) {
    return fail('page-too-large', `the page is ${bytes} bytes, over the ${PAGE_LIMIT_BYTES}-byte artifact cap`);
  }
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, page, 'utf8');
  return {
    ok: true,
    command: 'render',
    path: outPath,
    bytes,
    cards: cards.length,
    title: manifest.title,
    indexUrl: manifest.indexUrl,
    missingShots,
    ...(bytes > PAGE_WARN_BYTES && {
      warning: `the page is ${bytes} bytes, approaching the ${PAGE_LIMIT_BYTES}-byte artifact cap`,
    }),
  };
}

/** Resolves the id that the next registration of each slug in the comma-separated `slugs` takes, without writing. */
async function resolveIdsForSlugs(setDir: string, slugs: string): Promise<IndexPrototypesResult> {
  const list = parseInputs(slugs);
  if (list.length === 0) {
    return fail('invalid-args', '--slugs requires at least one slug');
  }
  const invalid = list.find((slug) => !isValidSlug(slug));
  if (invalid !== undefined) {
    return fail('invalid-slug', `slug "${invalid}" must match [a-z0-9][a-z0-9-]{0,39}`);
  }
  if (new Set(list).size !== list.length) {
    return fail('invalid-args', '--slugs names a slug twice');
  }

  const read = await readManifest(setDir);
  if (read.kind === 'invalid') {
    return fail('invalid-manifest', read.message);
  }
  const manifest = read.kind === 'ok' ? read.manifest : null;
  return { ok: true, command: 'resolve-ids', ids: resolveIds(manifest, list) };
}

// endregion | Helpers
