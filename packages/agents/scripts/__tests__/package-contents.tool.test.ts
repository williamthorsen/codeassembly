import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/** Absolute path to the `codeassembly` package root. */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The built CLI entry point, which doubles as the marker that this package has been built at all. */
const cliEntry = 'dist/esm/cli.js';

/**
 * The slice of `npm pack --dry-run --json` this suite reads. Parsing rather than trusting the shape means a change
 * in npm's report fails here, naming itself, instead of silently emptying every assertion below into a pass.
 */
const PackReportSchema = z.array(z.object({ files: z.array(z.object({ path: z.string() })) }));

const packedPaths = readPackedPaths();

describe('packed contents', () => {
  it('has build output to pack', () => {
    // Every assertion below reads what is on disk, so an unbuilt tree would fail all of them for a reason that
    // has nothing to do with the allowlist. Failing here first names the real cause.
    expect(
      existsSync(path.join(packageRoot, cliEntry)),
      `No build output at ${cliEntry}. Run \`nmr --filter codeassembly build\` before this suite.`,
    ).toBe(true);
  });

  it('ships the launcher and the built CLI it loads', () => {
    expect(packedPaths).toContain('bin/codeassembly.js');
    expect(packedPaths).toContain(cliEntry);
  });

  it('ships the guidance content the CLI installs', () => {
    expect(packedPaths.filter((entry) => entry.startsWith('dist/content/skills/'))).not.toHaveLength(0);
  });

  it('excludes the TypeScript sources', () => {
    // A package with no `files` allowlist falls back to `.gitignore`, which ignores `dist/` and ships `src/`
    // instead: the exact inversion of what an installed CLI needs.
    expect(packedPaths.filter((entry) => entry.startsWith('src/'))).toEqual([]);
  });

  it('excludes tests and test directories', () => {
    expect(packedPaths.filter((entry) => entry.split('/').includes('__tests__'))).toEqual([]);
    expect(packedPaths.filter((entry) => /\.test\.[cm]?[jt]s$/.test(entry))).toEqual([]);
  });
});

// region | Helpers

/**
 * Lists the paths `npm pack` would include. The dry run writes no tarball, so a failing assertion cannot strand a
 * `.tgz` in the package root.
 */
function readPackedPaths(): ReadonlyArray<string> {
  const stdout = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: packageRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const [report] = PackReportSchema.parse(JSON.parse(stdout));
  return report?.files.map((file) => file.path) ?? [];
}

// endregion | Helpers
