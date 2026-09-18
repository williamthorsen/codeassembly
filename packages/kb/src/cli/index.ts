/* eslint n/no-process-exit: off -- The OS must receive the bin's resolved exit code, and this module is loaded only by `bin/kb.js`. */
/* eslint unicorn/no-process-exit: off -- The OS must receive the bin's resolved exit code, and this module is loaded only by `bin/kb.js`. */
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import type { CommandOutput } from './commands/check.ts';
import { run } from './run.ts';
import { readlineSelectKbPrompt } from './select-kb-prompt.ts';

/**
 * Entry point for the `kb` bin. The module is only ever loaded via `bin/kb.js`'s dynamic import of the build output,
 * so `main` runs unconditionally on load. It dispatches the parsed argv through the pure {@link run} dispatcher, writes
 * the resolved streams, and exits with the resolved code.
 *
 * An unexpected throw from a command, such as a rule-engine crash that `runCheck` re-propagates, is caught here and
 * exits 2. Without that catch, the bin wrapper's "failed to load" branch would catch it and exit 1, which is reserved
 * for error-severity findings.
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
    process.stderr.write(`kb: unexpected error: ${describeError(error)}\n`);
    process.exit(2);
  }
  if (output.stdout !== '') process.stdout.write(output.stdout);
  if (output.stderr !== '') process.stderr.write(output.stderr);
  process.exit(output.exitCode);
}

await main();
