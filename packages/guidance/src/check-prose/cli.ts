/* eslint n/no-process-exit: off -- CLI entry point: The exit code reports the check's verdict, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the check-prose helper: runs every revise-prose detector over one Markdown file at any path,
// printing the candidates and exiting 1 when there are any.

import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import packageJson from '../../package.json' with { type: 'json' };
import { findNearestKey } from '../validate-preferences/find-nearest-key.ts';
import { checkProse, renderCheckJson, renderCheckText } from './check-prose.ts';

const KNOWN_OPTIONS = ['--file', '--help', '--json', '--version'];

/**
 * Checks the file named by `--file`, resolved against `cwd`, and prints the candidates as text or, under `--json`, as
 * one JSON document. Returns the exit code: 0 without candidates, 1 with candidates, and 2 on a usage error or an
 * unreadable file.
 */
export async function runCheckProse(
  argv: readonly string[],
  cwd: string,
  programName = deriveProgramName(process.argv[1]),
): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(buildHelp(programName));
    return 0;
  }
  if (argv.includes('--version') || argv.includes('-V')) {
    process.stdout.write(`${packageJson.version}\n`);
    return 0;
  }

  let options: { file: string; json: boolean };
  try {
    options = parseOptions(argv);
  } catch (error) {
    process.stderr.write(`${programName}: ${describeError(error)}; run ${programName} --help for usage\n`);
    return 2;
  }

  let content: string;
  try {
    content = await readFile(path.resolve(cwd, options.file), 'utf8');
  } catch (error) {
    process.stderr.write(
      `${programName}: cannot read ${options.file}: ${describeError(error)}; pass a readable file to --file\n`,
    );
    return 2;
  }

  const check = checkProse({ file: options.file, content });
  process.stdout.write(options.json ? renderCheckJson(check) : renderCheckText(check));
  return check.candidates.length === 0 ? 0 : 1;
}

if (isEntryPoint()) {
  const programName = deriveProgramName(process.argv[1]);
  try {
    process.exit(await runCheckProse(process.argv.slice(2), process.cwd(), programName));
  } catch (error) {
    process.stderr.write(`${programName}: ${describeError(error)}\n`);
    process.exit(1);
  }
}

// region | Helpers

/** Returns the usage text that `--help` prints. */
function buildHelp(programName: string): string {
  return [
    `${programName}: run every revise-prose detector over one Markdown file at any path, without the sweep record`,
    '',
    `Usage: ${programName} --file <path> [--json]`,
    '',
    'Options:',
    '  --file <path>    The file to check, read as Markdown whatever its extension',
    '  --json           Print one JSON document: { file, rules, candidates }',
    '  -h, --help       Print this help',
    '  -V, --version    Print the version',
    '',
    'Exits 0 without candidates, 1 with candidates, and 2 on a usage error or an unreadable file.',
    '',
    'Example:',
    `  ${programName} --file /tmp/prose-check.md --json`,
    '',
  ].join('\n');
}

/** Returns the invoked program's name: the basename of its path, without an extension. */
function deriveProgramName(entryPath: string | undefined): string {
  if (entryPath === undefined) {
    return 'check-prose';
  }
  return path.basename(entryPath, path.extname(entryPath));
}

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. On a `realpathSync` failure the function emits a warning to stderr and
 * returns `false`.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    process.stderr.write(`check-prose: warning: could not determine entry point: ${describeError(error)}\n`);
    return false;
  }
}

/** Parses the options, throwing on an unknown option, a positional argument, or a missing `--file`. */
function parseOptions(argv: readonly string[]): { file: string; json: boolean } {
  const unknown = argv.find((arg) => arg.startsWith('-') && !KNOWN_OPTIONS.includes(arg.split('=', 1)[0] ?? arg));
  if (unknown !== undefined) {
    const nearest = findNearestKey(unknown, KNOWN_OPTIONS);
    throw new Error(`unknown option ${unknown}${nearest === undefined ? '' : `; did you mean ${nearest}?`}`);
  }

  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      file: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (positionals.length > 0) {
    throw new Error(`unexpected argument ${positionals[0]}; name the file with --file <path>`);
  }
  if (values.file === undefined || values.file === '') {
    throw new Error('--file <path> is required');
  }
  return { file: values.file, json: values.json };
}

// endregion | Helpers
