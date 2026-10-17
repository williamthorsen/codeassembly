import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

/**
 * Returns whether the module at `moduleUrl` is the process entry point. Both sides are resolved through
 * `realpathSync`, so a symlinked invocation path still matches. On a resolution failure the function warns on stderr,
 * prefixed with `programName`, and returns `true`.
 */
export function isEntryPoint(moduleUrl: string, programName: string): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(entry);
  } catch (error) {
    // A resolution failure most plausibly means that the calling module is the entry point, invoked through a stale
    // link, and returning `false` would silently no-op the CLI.
    process.stderr.write(`${programName}: warning: could not determine entry point: ${describeError(error)}\n`);
    return true;
  }
}
