import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** Absolute path to the `codeassembly` package root. */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The built CLI entry point, which doubles as the marker that this package has been built at all. */
const cliEntry = path.join('dist', 'esm', 'cli.js');

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
    const packed = readPackedPaths();

    expect(packed).toContain('bin/codeassembly.js');
    expect(packed).toContain(cliEntry.split(path.sep).join('/'));
  });

  it('ships the guidance content the CLI installs', () => {
    const packed = readPackedPaths();

    expect(packed.filter((entry) => entry.startsWith('dist/content/skills/'))).not.toHaveLength(0);
  });

  it('excludes the TypeScript sources', () => {
    // A package with no `files` allowlist falls back to `.gitignore`, which ignores `dist/` and ships `src/`
    // instead -- the exact inversion of what an installed CLI needs.
    expect(readPackedPaths().filter((entry) => entry.startsWith('src/'))).toEqual([]);
  });

  it('excludes tests and test directories', () => {
    const packed = readPackedPaths();

    expect(packed.filter((entry) => entry.split('/').includes('__tests__'))).toEqual([]);
    expect(packed.filter((entry) => /\.test\.[cm]?[jt]s$/.test(entry))).toEqual([]);
  });
});

// region | Helpers

/**
 * Lists the paths `npm pack` would include. The dry run writes no tarball, so a failing assertion cannot strand a
 * `.tgz` in the package root. Memoized because every case asks the same question of one `npm` invocation.
 */
function readPackedPaths(): ReadonlyArray<string> {
  packedPaths ??= runPackDryRun();
  return packedPaths;
}

/** Invokes `npm pack --dry-run --json` against the package root and reads the file list out of its report. */
function runPackDryRun(): ReadonlyArray<string> {
  const stdout = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: packageRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const [report] = JSON.parse(stdout) as Array<{ files: ReadonlyArray<{ path: string }> }>;
  return report?.files.map((file) => file.path) ?? [];
}

let packedPaths: ReadonlyArray<string> | undefined;

// endregion | Helpers
