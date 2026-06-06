/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
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
