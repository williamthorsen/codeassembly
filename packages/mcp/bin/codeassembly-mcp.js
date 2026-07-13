#!/usr/bin/env node

// Thin wrapper so pnpm can symlink the bin at install time, before `dist/` exists.
// The real entry point loads at runtime from the build output.
// See packages/run-core/README.md ("Bin wrapper pattern") for details.
try {
  await import('../dist/esm/cli.js');
} catch (error) {
  if (error.code === 'ERR_MODULE_NOT_FOUND') {
    process.stderr.write('codeassembly-mcp: build output not found — run `pnpm run build` first\n');
  } else {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`codeassembly-mcp: failed to load: ${message}\n`);
  }
  process.exit(1);
}
