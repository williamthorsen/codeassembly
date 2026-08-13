/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
// CLI entry point for the update-jira-ticket pre-flight checker.
//
// Reads the HTML payload from stdin, runs `check()`, and writes the discriminated-union result to stdout as
// pretty-printed JSON. Exit 0 for both `ok: true` and `ok: false` (recoverable findings are not system errors);
// exit 1 only when the invocation itself is wrong (unreadable stdin).

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { readAll } from '../lib/stream-helpers.ts';
import { check } from './check.ts';

/** Top-level entry: read stdin, run the check, emit JSON. */
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

// Run as a CLI when invoked directly; stay importable for tests.
if (isEntryPoint()) {
  await main();
}

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path (e.g. a `--link` install of the agents skill bundle) still matches. On a `realpathSync`
 * failure (broken symlink, permission denied) the function emits a warning to stderr and returns `false`, matching
 * the pattern in `src/kb-add/cli.ts` so silent skips do not hide environment problems.
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
