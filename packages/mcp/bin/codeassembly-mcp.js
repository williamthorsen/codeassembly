#!/usr/bin/env node

import { existsSync } from 'node:fs';

// Committed launch path for the stdio server, so `.claude/settings.json` targets a file that
// exists before `dist/` is built. The real entry point loads at runtime from the build output.
// See packages/agents/README.md ("Bin wrapper pattern") for details.
const entryPoint = new URL('../dist/esm/cli.js', import.meta.url);

// Gate on the entry file itself: Node raises ERR_MODULE_NOT_FOUND for any unresolved
// module in the graph, so keying the build-first message off the error code would also
// fire when the build is present and one of its imports is missing.
if (!existsSync(entryPoint)) {
  process.stderr.write('codeassembly-mcp: build output not found — run `pnpm run bootstrap` first\n');
  process.exit(1);
}

try {
  await import(entryPoint.href);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`codeassembly-mcp: failed to load: ${message}\n`);
  process.exit(1);
}
