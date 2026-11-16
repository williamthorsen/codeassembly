/* eslint n/no-process-exit: off -- The OS must receive the bin's resolved exit code, and this module is loaded only by `bin/agent-logic.js`. */
/* eslint unicorn/no-process-exit: off -- The OS must receive the bin's resolved exit code, and this module is loaded only by `bin/agent-logic.js`. */
import process from 'node:process';

import { run } from './run.ts';

/**
 * Runs the `agent-logic` bin. `bin/agent-logic.js` loads this module from the build output, so `main` runs on load,
 * writes what {@link run} resolves, and exits with its code.
 */
async function main(): Promise<void> {
  const output = await run(process.argv.slice(2));
  if (output.stdout !== '') process.stdout.write(output.stdout);
  if (output.stderr !== '') process.stderr.write(output.stderr);
  process.exit(output.exitCode);
}

await main();
