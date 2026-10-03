/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { isEnoent } from '../lib/type-guards.ts';
import { intakeScreenshot } from './intake-screenshot.ts';
import { isValidSlug, listLatestEntries, nextVersion, readManifest, writeManifest } from './manifest.ts';
import { type IndexCard, PAGE_LIMIT_BYTES, PAGE_WARN_BYTES, renderIndexPage } from './render-index.ts';
import type { IndexPrototypesFailure, IndexPrototypesResult, Manifest, ManifestEntry } from './types.ts';

const COMMANDS = ['record-index', 'register', 'render'] as const;

type Command = (typeof COMMANDS)[number];

const COMMAND_NAMES: ReadonlySet<string> = new Set(COMMANDS);

const FLAGS: readonly FlagSpec[] = [
  { name: 'description', takesValue: true },
  { name: 'inputs', takesValue: true },
  { name: 'lens', takesValue: true },
  { name: 'out', takesValue: true },
  { name: 'screenshot', takesValue: true },
  { name: 'set-dir', takesValue: true },
  { name: 'set-title', takesValue: true },
  { name: 'slug', takesValue: true },
  { name: 'source', takesValue: true },
  { name: 'title', takesValue: true },
  { name: 'url', takesValue: true },
];

const COMMAND_FLAGS: Record<Command, { required: readonly string[]; optional: readonly string[] }> = {
  'record-index': { required: ['set-dir', 'url'], optional: [] },
  register: {
    required: ['set-dir', 'slug', 'title', 'url'],
    optional: ['description', 'inputs', 'lens', 'screenshot', 'set-title', 'source'],
  },
  render: { required: ['out', 'set-dir'], optional: [] },
};

/** A parsed invocation: the command and its flag values, keyed by flag name. */
export interface ParsedArgs {
  command: Command;
  values: Record<string, string>;
}

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

if (isEntryPoint()) {
  await main();
}

/**
 * Runs one command of the helper. A recoverable failure returns `{ ok: false, error, message }` having written
 * nothing; a system failure (out of disk, permission denied) propagates.
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

  const setDir = path.resolve(requireFlag(args.values, 'set-dir'));
  switch (args.command) {
    case 'record-index':
      return recordIndex(setDir, requireFlag(args.values, 'url'));
    case 'register':
      return register(setDir, args.values, input.now);
    case 'render':
      return render(setDir, path.resolve(requireFlag(args.values, 'out')));
    default: {
      const _exhaustive: never = args.command;
      throw new Error(`unhandled command: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Parses argv into a command and its flags, throwing on an unknown command, a flag that the command does not take, a
 * missing required flag, or an empty value.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const { positionals, flags } = scanFlags(argv, FLAGS);
  const [command, extra] = positionals;
  if (command === undefined) {
    throw new Error(`a command is required: ${COMMANDS.join(', ')}`);
  }
  if (!isCommand(command)) {
    throw new Error(`unknown command "${command}"; expected one of ${COMMANDS.join(', ')}`);
  }
  if (extra !== undefined) {
    throw new Error(`unexpected argument: ${extra}`);
  }

  const values = valueFlagMap(flags);
  const { required, optional } = COMMAND_FLAGS[command];
  for (const [name, value] of Object.entries(values)) {
    if (!required.includes(name) && !optional.includes(name)) {
      throw new Error(`${command} does not take --${name}`);
    }
    if (value === '') {
      throw new Error(`--${name} requires a value`);
    }
  }
  for (const name of required) {
    if (values[name] === undefined) {
      throw new Error(`${command} requires --${name}`);
    }
  }
  return { command, values };
}

// region | Helpers

/** Returns a failure result. */
function fail(error: IndexPrototypesFailure['error'], message: string): IndexPrototypesFailure {
  return { ok: false, error, message };
}

/** Returns true when `value` names a helper command. */
function isCommand(value: string): value is Command {
  return COMMAND_NAMES.has(value);
}

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    process.stderr.write(`index-prototypes: warning: could not determine entry point: ${describeError(error)}\n`);
    return false;
  }
}

/** Returns true when `value` parses as an http or https URL. */
function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** Splits a comma-separated `--inputs` value into trimmed, non-empty items. */
function parseInputs(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
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
    return fail('manifest-not-found', `no manifest in ${setDir}; register a prototype first`);
  }
  if (read.kind === 'invalid') {
    return fail('invalid-manifest', read.message);
  }
  const manifestPath = await writeManifest(setDir, { ...read.manifest, indexUrl: url });
  return { ok: true, command: 'record-index', manifestPath, indexUrl: url };
}

/** Adds a registration to the set's manifest, creating the manifest on the set's first registration. */
async function register(setDir: string, values: Record<string, string>, now: Date): Promise<IndexPrototypesResult> {
  const slug = requireFlag(values, 'slug');
  if (!isValidSlug(slug)) {
    return fail('invalid-slug', `slug "${slug}" must match [a-z0-9][a-z0-9-]{0,39}`);
  }
  const url = requireFlag(values, 'url');
  if (!isWebUrl(url)) {
    return fail('invalid-url', `--url "${url}" is not an http or https URL`);
  }

  const read = await readManifest(setDir);
  if (read.kind === 'invalid') {
    return fail('invalid-manifest', read.message);
  }
  const existing = read.kind === 'ok' ? read.manifest : null;
  const setTitle = values['set-title'] ?? existing?.title;
  if (setTitle === undefined) {
    return fail('missing-set-title', 'the first registration in a set requires --set-title');
  }

  const version = nextVersion(existing, slug);
  let shot: string | null = null;
  const screenshot = values.screenshot;
  if (screenshot !== undefined) {
    const intake = await intakeScreenshot({
      sourcePath: path.resolve(screenshot),
      setDir,
      slug,
      version,
    });
    if (!intake.ok) {
      return fail(intake.error, intake.message);
    }
    shot = intake.shot;
  }

  const entry: ManifestEntry = {
    slug,
    version,
    registeredAt: now.toISOString(),
    title: requireFlag(values, 'title'),
    url,
    source: values.source ?? null,
    lens: values.lens ?? null,
    inputs: parseInputs(values.inputs),
    description: values.description ?? null,
    shot,
  };

  const manifest: Manifest = {
    title: setTitle,
    indexUrl: existing?.indexUrl ?? null,
    entries: [...(existing?.entries ?? []), entry],
  };
  const manifestPath = await writeManifest(setDir, manifest);
  return { ok: true, command: 'register', manifestPath, entry };
}

/**
 * Renders the set's index page from the latest version of each slug and writes it to `outPath`, refusing a page over
 * the artifact cap. A recorded screenshot that is missing from disk renders as the placeholder and is reported.
 */
async function render(setDir: string, outPath: string): Promise<IndexPrototypesResult> {
  const read = await readManifest(setDir);
  if (read.kind === 'missing') {
    return fail('manifest-not-found', `no manifest in ${setDir}; register a prototype first`);
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

  const page = renderIndexPage({ title: manifest.title, cards });
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

/** Returns a required flag's value, which `parseArgs` has already guaranteed. */
function requireFlag(values: Record<string, string>, name: string): string {
  const value = values[name];
  if (value === undefined) {
    throw new Error(`--${name} is missing after parsing`);
  }
  return value;
}

// endregion | Helpers
