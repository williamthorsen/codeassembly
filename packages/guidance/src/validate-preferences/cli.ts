/* eslint n/no-process-exit: off -- CLI entry point: The process must exit non-zero on an invalid file, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the validate-preferences helper: validates `preferences.yaml` files against the schema bundled
// with this release, printing the findings and exiting 1 when any file is invalid.

import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { parse as parseYaml } from 'yaml';

import { isEnoent } from '../lib/type-guards.ts';
import preferencesSchema from '../schemas/preferences.v1.json' with { type: 'json' };
import { type Finding, validatePreferences } from './validate-preferences.ts';

/** The outcome of validating one preferences file. */
export interface FileResult {
  readonly file: string;
  readonly present: boolean;
  readonly valid: boolean;
  readonly findings: readonly Finding[];
}

/**
 * Validates the files named in `argv`, or `.agents/preferences.yaml` under `cwd` when none is named, and prints the
 * findings as text or, under `--json`, as one JSON object per file. Returns the exit code: 1 when any file is invalid
 * or the arguments are rejected, else 0.
 */
export async function runValidatePreferences(
  argv: readonly string[],
  cwd: string,
  programName = deriveProgramName(process.argv[1]),
): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(buildHelp(programName));
    return 0;
  }

  let options: { json: boolean; strict: boolean; files: readonly string[] };
  try {
    options = parseOptions(argv);
  } catch (error) {
    process.stderr.write(`${programName}: ${describeError(error)}; run ${programName} --help for usage\n`);
    return 1;
  }

  // When the arguments do not name a file, the default file is optional, so its absence is valid.
  const isDefault = options.files.length === 0;
  const files = isDefault ? [path.join('.agents', 'preferences.yaml')] : options.files;
  const results: FileResult[] = [];
  for (const file of files) {
    results.push(await validateFile(path.resolve(cwd, file), { isOptional: isDefault, isStrict: options.strict }));
  }

  if (options.json) {
    for (const result of results) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } else {
    process.stdout.write(formatText(results, cwd, programName));
  }
  return results.every((result) => result.valid) ? 0 : 1;
}

if (isEntryPoint()) {
  const programName = deriveProgramName(process.argv[1]);
  try {
    process.exit(await runValidatePreferences(process.argv.slice(2), process.cwd(), programName));
  } catch (error) {
    process.stderr.write(`${programName}: ${describeError(error)}\n`);
    process.exit(1);
  }
}

// region | Helpers

/** Returns the usage text that `--help` prints. */
function buildHelp(programName: string): string {
  return [
    `${programName}: validate preferences.yaml files against the preferences schema bundled with this release`,
    '',
    `Usage: ${programName} [--json] [--strict] [file...]`,
    '',
    'Arguments:',
    '  file        A preferences file to validate. Every named file must exist.',
    '              Without one, validates .agents/preferences.yaml, which may be absent.',
    '',
    'Options:',
    '  --json      Print one JSON object per file: { file, present, valid, findings }',
    '  --strict    Treat warnings, such as an unrecognized key, as failures',
    '  -h, --help  Print this help',
    '',
    'Exits 1 when any file is invalid, and 0 otherwise.',
    '',
    'Example:',
    `  ${programName} --strict .agents/preferences.yaml ~/.agents/preferences.yaml`,
    '',
  ].join('\n');
}

/** Returns the invoked program's name: the basename of its path, without an extension. */
function deriveProgramName(entryPath: string | undefined): string {
  if (entryPath === undefined) {
    return 'validate-preferences';
  }
  return path.basename(entryPath, path.extname(entryPath));
}

/** Renders one line per finding, a line for an absent optional file, and a closing summary line. */
function formatText(results: readonly FileResult[], cwd: string, programName: string): string {
  const lines: string[] = [];
  for (const result of results) {
    const displayPath = path.relative(cwd, result.file) || result.file;
    if (!result.present && result.valid) {
      lines.push(`${displayPath}: not present; the file is optional`);
    }
    for (const finding of result.findings) {
      lines.push(`${displayPath}: ${finding.path}: ${finding.level}: ${finding.message}`);
    }
  }
  const invalidCount = results.filter((result) => !result.valid).length;
  lines.push(
    invalidCount === 0
      ? `${programName}: ${results.length} file(s) valid`
      : `${programName}: ${invalidCount} of ${results.length} file(s) invalid`,
  );
  return `${lines.join('\n')}\n`;
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
    process.stderr.write(`validate-preferences: warning: could not determine entry point: ${describeError(error)}\n`);
    return false;
  }
}

/** Parses the options and file arguments, throwing on an unknown option. */
function parseOptions(argv: readonly string[]): { json: boolean; strict: boolean; files: readonly string[] } {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      strict: { type: 'boolean', default: false },
    },
    strict: true,
  });
  return { json: values.json, strict: values.strict, files: positionals };
}

/**
 * Reads and validates one preferences file. A missing file is valid only when it is optional; under `isStrict`, a
 * warning makes the file invalid.
 */
async function validateFile(
  filePath: string,
  { isOptional, isStrict }: { isOptional: boolean; isStrict: boolean },
): Promise<FileResult> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (!isEnoent(error)) {
      throw error;
    }
    if (isOptional) {
      return { file: filePath, present: false, valid: true, findings: [] };
    }
    const finding: Finding = { level: 'error', path: '(root)', message: 'file not found' };
    return { file: filePath, present: false, valid: false, findings: [finding] };
  }

  let document: unknown;
  try {
    document = parseYaml(text);
  } catch (error) {
    const finding: Finding = { level: 'error', path: '(root)', message: `malformed YAML: ${describeError(error)}` };
    return { file: filePath, present: true, valid: false, findings: [finding] };
  }

  // An empty document does not declare any keys.
  const findings = validatePreferences(document ?? {}, preferencesSchema);
  const valid = isStrict ? findings.length === 0 : findings.every((finding) => finding.level !== 'error');
  return { file: filePath, present: true, valid, findings };
}

// endregion | Helpers
