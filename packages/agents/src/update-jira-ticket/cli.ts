/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the update-jira-ticket pre-flight checker.
//
// The exit code reports whether the invocation worked, not whether the payload is clean: The checker exits 0 for a
// payload with findings as it does for a clean one, and exits 1 only when stdin cannot be read.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { readAll } from '../lib/stream-helpers.ts';
import { check } from './check.ts';

/** Reads the HTML payload from stdin, runs the check, and writes the result to stdout as pretty-printed JSON. */
async function main(): Promise<void> {
  try {
    const html = await readAll(process.stdin);
    const result = check(html);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`update-jira-ticket: ${message}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. When `realpathSync` fails, the function warns on stderr and returns `false`.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`update-jira-ticket: warning: could not determine entry point: ${message}\n`);
    return false;
  }
}
