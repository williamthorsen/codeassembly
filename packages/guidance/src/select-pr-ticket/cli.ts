/* eslint n/no-process-exit: off -- CLI entry point: The process must exit non-zero on invalid input, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the select-pr-ticket helper: reads `gh pr view --json body,closingIssuesReferences` output on
// stdin and prints the selected ticket as JSON.

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { readAll } from '../lib/stream-helpers.ts';
import { parsePrTicketInput, selectPrTicket } from './select.ts';

/** Reads the PR JSON from stdin, writing the selection to stdout and every diagnostic to stderr. */
async function main(): Promise<void> {
  try {
    const argv = process.argv.slice(2);
    if (argv.length > 0) {
      throw new Error(`unexpected argument: ${argv.join(' ')}`);
    }
    const input = parsePrTicketInput(JSON.parse(await readAll(process.stdin)));
    process.stdout.write(`${JSON.stringify(selectPrTicket(input))}\n`);
  } catch (error) {
    process.stderr.write(`select-pr-ticket: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
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
    process.stderr.write(`select-pr-ticket: warning: could not determine entry point: ${describeError(error)}\n`);
    return false;
  }
}

// endregion | Helpers
