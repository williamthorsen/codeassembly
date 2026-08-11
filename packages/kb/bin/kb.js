#!/usr/bin/env node

// Imports only node builtins: a top-level import resolves before the gate below runs, so an
// unresolvable dependency would replace this file's build-first message with ERR_MODULE_NOT_FOUND.
import { existsSync } from 'node:fs';

// Thin wrapper so pnpm can symlink the bin at install time, before `dist/` exists.
// The real entry point loads at runtime from the build output.
// See packages/agents/README.md ("Bin wrapper pattern") for details.
const entryPoint = new URL('../dist/esm/cli/index.js', import.meta.url);

// Gate on the entry file itself: Node raises ERR_MODULE_NOT_FOUND for any unresolved
// module in the graph, so keying the build-first message off the error code would also
// fire when the build is present and one of its imports is missing.
if (!existsSync(entryPoint)) {
  process.stderr.write(
    'kb: build output not found. In a source checkout, run `pnpm run bootstrap`; otherwise reinstall the package.\n',
  );
  process.exit(1);
}

try {
  await import(entryPoint.href);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`kb: failed to load: ${message}\n`);
  process.exit(1);
}
