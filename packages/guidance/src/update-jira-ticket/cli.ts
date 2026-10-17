/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the update-jira-ticket pre-flight checker.
//
// The exit code reports whether the invocation worked, not whether the payload is clean: The checker exits 0 for a
// payload with findings as it does for a clean one, and exits 1 only when stdin cannot be read.

import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
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

if (isEntryPoint(import.meta.url, 'update-jira-ticket')) {
  await main();
}
