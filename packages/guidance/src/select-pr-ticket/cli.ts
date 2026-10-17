/* eslint n/no-process-exit: off -- CLI entry point: The process must exit non-zero on invalid input, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
// CLI entry point for the select-pr-ticket helper: reads `gh pr view --json body,closingIssuesReferences` output on
// stdin and prints the selected ticket as JSON.

import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
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

if (isEntryPoint(import.meta.url, 'select-pr-ticket')) {
  await main();
}

// region | Helpers

// endregion | Helpers
