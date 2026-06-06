/* eslint n/no-process-exit: off -- CLI entry point: the bin's resolved exit code must reach the OS, and this module is loaded only via `bin/kb.js`, never imported as a library; throwing-to-set-exitCode would lose the explicit 0/1/2 contract. */
/* eslint unicorn/no-process-exit: off -- same as above: `process.exit` is the correct termination mechanism at the process boundary, not a library-internal anti-pattern here. */
import process from 'node:process';

import { run } from './run.ts';

/**
 * Entry point for the `kb` bin. The module is only ever loaded via `bin/kb.js`'s dynamic import of the build output,
 * so `main` runs unconditionally on load — there is no entry-point guard. It dispatches the parsed argv through the
 * pure {@link run} dispatcher, writes the resolved streams, and exits with the resolved code.
 */
async function main(): Promise<void> {
  const output = await run({ argv: process.argv.slice(2), cwd: process.cwd() });
  if (output.stdout !== '') process.stdout.write(output.stdout);
  if (output.stderr !== '') process.stderr.write(output.stderr);
  process.exit(output.exitCode);
}

await main();
