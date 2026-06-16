/* eslint n/no-process-exit: off -- CLI entry point: the bin's resolved exit code must reach the OS, and this module is loaded only via `bin/kb.js`, never imported as a library; throwing-to-set-exitCode would lose the explicit 0/1/2 contract. */
/* eslint unicorn/no-process-exit: off -- same as above: `process.exit` is the correct termination mechanism at the process boundary, not a library-internal anti-pattern here. */
import process from 'node:process';

import type { CommandOutput } from './commands/check.ts';
import { run } from './run.ts';
import { readlineSelectKbPrompt } from './select-kb-prompt.ts';

/**
 * Entry point for the `kb` bin. The module is only ever loaded via `bin/kb.js`'s dynamic import of the build output,
 * so `main` runs unconditionally on load — there is no entry-point guard. It dispatches the parsed argv through the
 * pure {@link run} dispatcher, writes the resolved streams, and exits with the resolved code.
 *
 * An unexpected throw from a command (e.g. a rule-engine crash that `runCheck` deliberately re-propagates) is caught
 * here at the process seam and exits 2 — never the bin wrapper's `ERR_MODULE_NOT_FOUND` "failed to load" branch, and
 * never exit 1, which is reserved for "error-severity findings present".
 */
async function main(): Promise<void> {
  let output: CommandOutput;
  try {
    // Interactive prompting is possible only on a TTY; otherwise the no-argument set-default form errors instead of hanging.
    const selectKb = process.stdin.isTTY ? readlineSelectKbPrompt : undefined;
    output = await run({
      argv: process.argv.slice(2),
      cwd: process.cwd(),
      ...(selectKb !== undefined && { selectKb }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kb: unexpected error: ${message}\n`);
    process.exit(2);
  }
  if (output.stdout !== '') process.stdout.write(output.stdout);
  if (output.stderr !== '') process.stderr.write(output.stderr);
  process.exit(output.exitCode);
}

await main();
