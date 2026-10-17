/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the manage-jira-ticket helper: resolves where a Jira work item goes, compares `acli`'s active site
// with a ticket's site, converts a Markdown body to ADF, and creates the work item through `acli` exactly once.

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { readPreferences, readProjectPreferences } from '../derive-session-context/read-preferences.ts';
import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { isEnoent, isRecord } from '../lib/type-guards.ts';
import { loadWorkTypes } from '../lib/work-types.ts';
import { resolveProjectRoot } from '../shared/resolve-project-root.ts';
import { readSiteCheck, type SiteCheck } from './check-site.ts';
import { convertMarkdownToAdf } from './convert-body.ts';
import { type AcliResult, createWorkItem } from './create-work-item.ts';
import { readJiraPreferences, resolveTarget, type Target } from './resolve-target.ts';

const execFileAsync = promisify(execFile);

const USAGE = `usage:
  manage-jira-ticket check-site --target <url-or-host>
  manage-jira-ticket resolve-target --work-type <type>
  manage-jira-ticket convert-body --body-file <md> --out <path>
  manage-jira-ticket create --summary <text> --body-file <md> --work-type <type> [--parent <key>]`;

/** Runs the subcommand named by `process.argv`, writing its JSON result to stdout and every diagnostic to stderr. */
async function main(): Promise<void> {
  try {
    const [subcommand, ...argv] = process.argv.slice(2);
    switch (subcommand) {
      case 'check-site':
        await runCheckSite(argv);
        break;
      case 'convert-body':
        await runConvertBody(argv);
        break;
      case 'create':
        await runCreate(argv);
        break;
      case 'resolve-target':
        await runResolveTarget(argv);
        break;
      default:
        throw new Error(subcommand === undefined ? 'missing subcommand' : `unknown subcommand '${subcommand}'`);
    }
  } catch (error) {
    process.stderr.write(`manage-jira-ticket: ${describeError(error)}\n${USAGE}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, 'manage-jira-ticket')) {
  await main();
}

// region | Helpers

/** States why `check` failed and names the command that makes the target site active. */
function describeSiteMismatch(check: SiteCheck): string {
  const switchCommand = `acli jira auth switch --site ${check.targetSite}`;
  return check.activeSite === null
    ? `could not read acli's active site; the ticket is on ${check.targetSite}. Sign in, then run \`${switchCommand}\`.`
    : `acli's active site is ${check.activeSite}, but the ticket is on ${check.targetSite}. Run \`${switchCommand}\`.`;
}

/** Parses `argv` against `specs` into a value map, rejecting positional arguments and absent required flags. */
function parseValues(argv: readonly string[], specs: readonly FlagSpec[], required: readonly string[]) {
  const { flags, positionals } = scanFlags(argv, specs);
  if (positionals.length > 0) {
    throw new Error(`unexpected argument: ${positionals.join(' ')}`);
  }
  const values = valueFlagMap(flags);
  for (const name of required) {
    if (values[name] === undefined || values[name] === '') {
      throw new Error(`--${name} is required`);
    }
  }
  return values;
}

/** Reads the Markdown body; throws when the file is absent or empty, so that a description is never silently dropped. */
async function readBody(bodyFile: string): Promise<string> {
  try {
    const stats = await stat(bodyFile);
    if (stats.isFile() && stats.size > 0) {
      return await readFile(bodyFile, 'utf8');
    }
  } catch (error) {
    if (!isEnoent(error)) {
      throw error;
    }
  }
  throw new Error(`Body file missing or empty: ${bodyFile}`);
}

/**
 * Resolves the target for `workType` from the repository's preferences, which the caller reads from the repository's
 * file alone, so that a project key in the user's global file never sends a repository's work items to another project.
 */
async function readTarget(workType: string, preferences: Readonly<Record<string, unknown>>): Promise<Target> {
  const workTypes = await loadWorkTypes();
  if (workTypes === null) {
    throw new Error('the work-type taxonomy could not be read');
  }
  return resolveTarget(workType, readJiraPreferences(preferences), workTypes);
}

/**
 * Reads `ticket.base_url` from the repository's preferences, falling back to the global file as the session manifest
 * does, and treats an absent or empty value as unset. Unlike the project key, a global base URL is safe to read here:
 * It can only make the site check refuse, never send a work item elsewhere.
 */
async function readTicketBaseUrl(projectRoot: string): Promise<string | undefined> {
  const baseUrl = (await readPreferences({ cwd: projectRoot })).preferences.ticket?.base_url;
  return baseUrl === '' ? undefined : baseUrl;
}

/** Runs `acli` without a shell and reports its exit code and output; throws when `acli` cannot be started. */
async function runAcli(args: readonly string[]): Promise<AcliResult> {
  try {
    const { stderr, stdout } = await execFileAsync('acli', args, { maxBuffer: 16_777_216 });
    return { exitCode: 0, stderr, stdout };
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error('acli is not installed or not on PATH', { cause: error });
    }
    if (
      isRecord(error) &&
      typeof error.code === 'number' &&
      typeof error.stderr === 'string' &&
      typeof error.stdout === 'string'
    ) {
      return { exitCode: error.code, stderr: error.stderr, stdout: error.stdout };
    }
    throw error;
  }
}

/** Prints the site check for `--target`, exiting non-zero and naming the switch command unless the sites match. */
async function runCheckSite(argv: readonly string[]): Promise<void> {
  const values = parseValues(argv, [{ name: 'target', takesValue: true }], ['target']);
  const check = await readSiteCheck(values.target ?? '', runAcli);
  writeJson(check);
  if (!check.match) {
    process.stderr.write(`manage-jira-ticket: ${describeSiteMismatch(check)}\n`);
    process.exitCode = 1;
  }
}

/** Converts the body to ADF and writes it to `--out`. */
async function runConvertBody(argv: readonly string[]): Promise<void> {
  const values = parseValues(
    argv,
    [
      { name: 'body-file', takesValue: true },
      { name: 'out', takesValue: true },
    ],
    ['body-file', 'out'],
  );
  const adfPath = path.resolve(values.out ?? '');
  const adf = convertMarkdownToAdf(await readBody(values['body-file'] ?? ''));
  await writeFile(adfPath, `${JSON.stringify(adf)}\n`);
  writeJson({ adfPath });
}

/**
 * Resolves the target, converts the body, and creates the work item. Exits non-zero, after printing the result, when the
 * preferences do not name a project or the create did not yield a key.
 */
async function runCreate(argv: readonly string[]): Promise<void> {
  const values = parseValues(
    argv,
    [
      { name: 'body-file', takesValue: true },
      { name: 'parent', takesValue: true },
      { name: 'summary', takesValue: true },
      { name: 'work-type', takesValue: true },
    ],
    ['body-file', 'summary', 'work-type'],
  );
  const markdown = await readBody(values['body-file'] ?? '');
  const projectRoot = resolveProjectRoot();
  const target = await readTarget(values['work-type'] ?? '', await readProjectPreferences(projectRoot));
  if ('fallback' in target) {
    writeJson(target);
    process.stderr.write(`manage-jira-ticket: ${target.warning}\n`);
    process.exit(1);
  }

  // Check the site before any other `acli` call, because `acli` acts on its active site whatever the project key names.
  const baseUrl = await readTicketBaseUrl(projectRoot);
  let activeSite: string | null = null;
  if (baseUrl !== undefined) {
    const check = await readSiteCheck(baseUrl, runAcli);
    if (!check.match) {
      const warning = `Jira work item not created: ${describeSiteMismatch(check)}`;
      writeJson({
        activeSite: check.activeSite,
        fallback: check.activeSite === null ? 'site-unreadable' : 'wrong-site',
        targetSite: check.targetSite,
        warning,
      });
      process.stderr.write(`manage-jira-ticket: ${warning}\n`);
      process.exit(1);
    }
    activeSite = check.activeSite;
  }

  const scratchDir = await mkdtemp(path.join(tmpdir(), 'manage-jira-ticket-'));
  try {
    const adfPath = path.join(scratchDir, 'description.json');
    await writeFile(adfPath, JSON.stringify(convertMarkdownToAdf(markdown)));
    const parent = values.parent === '' ? undefined : values.parent;
    const outcome = await createWorkItem({ ...target, adfPath, parent, summary: values.summary ?? '' }, runAcli);
    for (const diagnostic of outcome.diagnostics) {
      process.stderr.write(`manage-jira-ticket: ${diagnostic}\n`);
    }
    writeJson({ ...outcome.result, activeSite });
    if (!outcome.ok) {
      process.exitCode = 1;
    }
  } finally {
    await rm(scratchDir, { force: true, recursive: true });
  }
}

/** Resolves and prints the target for `--work-type`. */
async function runResolveTarget(argv: readonly string[]): Promise<void> {
  const values = parseValues(argv, [{ name: 'work-type', takesValue: true }], ['work-type']);
  writeJson(await readTarget(values['work-type'] ?? '', await readProjectPreferences(resolveProjectRoot())));
}

/** Writes `value` to stdout as indented JSON. */
function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

// endregion | Helpers
