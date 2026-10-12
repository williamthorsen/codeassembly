/* eslint n/no-process-exit: off -- CLI entry point: The process must exit non-zero on an invalid file, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the check-preferences helper: validates a `preferences.yaml` against the schema bundled with
// this release, printing one line per finding and exiting 1 when any finding is an error.

import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { parse as parseYaml } from 'yaml';

import { isEnoent } from '../lib/type-guards.ts';
import preferencesSchema from '../schemas/preferences.v1.json' with { type: 'json' };
import { checkPreferences, formatFinding } from './check-preferences.ts';

/** Checks the file named on the command line, or `.agents/preferences.yaml` under the working directory. */
export async function runCheckPreferences(argv: readonly string[], cwd: string): Promise<number> {
  if (argv.length > 1) {
    throw new Error(`expected at most one path (got ${argv.join(' ')})`);
  }
  const filePath = path.resolve(cwd, argv[0] ?? path.join('.agents', 'preferences.yaml'));

  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      process.stderr.write(`check-preferences: ${filePath} does not exist; nothing to check\n`);
      return 0;
    }
    throw error;
  }

  let document: unknown;
  try {
    document = parseYaml(text);
  } catch (error) {
    process.stdout.write(`error (root): malformed YAML in ${filePath}: ${describeError(error)}\n`);
    return 1;
  }

  // An empty document declares no keys.
  const findings = checkPreferences(document ?? {}, preferencesSchema);
  for (const finding of findings) {
    process.stdout.write(`${formatFinding(finding)}\n`);
  }
  return findings.some((finding) => finding.level === 'error') ? 1 : 0;
}

if (isEntryPoint()) {
  try {
    process.exit(await runCheckPreferences(process.argv.slice(2), process.cwd()));
  } catch (error) {
    process.stderr.write(`check-preferences: ${describeError(error)}\n`);
    process.exit(1);
  }
}

// region | Helpers

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
    process.stderr.write(`check-preferences: warning: could not determine entry point: ${describeError(error)}\n`);
    return false;
  }
}

// endregion | Helpers
