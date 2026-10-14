/* eslint n/no-process-exit: off -- CLI entry point: The process must exit non-zero on an invalid file, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the validate-preferences helper: validates a `preferences.yaml` against the schema bundled with
// this release, printing the findings as JSON and exiting 1 when any finding is an error.

import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { parse as parseYaml } from 'yaml';

import { isEnoent } from '../lib/type-guards.ts';
import preferencesSchema from '../schemas/preferences.v1.json' with { type: 'json' };
import { type Finding, validatePreferences } from './validate-preferences.ts';

/**
 * Checks the file named on the command line, or `.agents/preferences.yaml` under the working directory, and prints
 * `{ file, present, valid, findings }` as JSON. Returns the exit code: 1 when any finding is an error, else 0.
 */
export async function runValidatePreferences(argv: readonly string[], cwd: string): Promise<number> {
  if (argv.length > 1) {
    throw new Error(`expected at most one path (got ${argv.join(' ')})`);
  }
  const filePath = path.resolve(cwd, argv[0] ?? path.join('.agents', 'preferences.yaml'));
  const result = await checkFile(filePath);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.valid ? 0 : 1;
}

if (isEntryPoint()) {
  try {
    process.exit(await runValidatePreferences(process.argv.slice(2), process.cwd()));
  } catch (error) {
    process.stderr.write(`validate-preferences: ${describeError(error)}\n`);
    process.exit(1);
  }
}

// region | Helpers

/** Reads and checks one preferences file. A missing file is valid, because the file is optional. */
async function checkFile(
  filePath: string,
): Promise<{ file: string; present: boolean; valid: boolean; findings: readonly Finding[] }> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return { file: filePath, present: false, valid: true, findings: [] };
    }
    throw error;
  }

  let document: unknown;
  try {
    document = parseYaml(text);
  } catch (error) {
    const finding: Finding = { level: 'error', path: '(root)', message: `malformed YAML: ${describeError(error)}` };
    return { file: filePath, present: true, valid: false, findings: [finding] };
  }

  // An empty document declares no keys.
  const findings = validatePreferences(document ?? {}, preferencesSchema);
  const valid = findings.every((finding) => finding.level !== 'error');
  return { file: filePath, present: true, valid, findings };
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

// endregion | Helpers
