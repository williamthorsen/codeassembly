import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/** Absolute path to the workspace directory holding every package. */
const packagesDir = path.resolve(import.meta.dirname, '..', '..', 'packages');

/**
 * Paths a named package must ship beyond the invariants every publishable package satisfies. A value matches by
 * prefix, so an exact file path names itself and a directory names everything under it.
 */
const requiredPaths: Readonly<Record<string, ReadonlyArray<string>>> = {
  codeassembly: ['dist/esm/cli.js', 'dist/content/skills/'],
};

describe.each(findPublishablePackages())('$name packs correctly', ({ bins, dir, name }) => {
  const packed = readPackedPaths(dir);

  it('ships build output', () => {
    expect(
      packed.filter((entry) => entry.startsWith('dist/')),
      `${name} packs no build output. Run \`nmr build\` before this suite.`,
    ).not.toHaveLength(0);
  });

  it.each(bins)('ships its declared bin %s', (bin) => {
    expect(packed).toContain(bin);
  });

  it.each(requiredPaths[name] ?? [])('ships %s', (required) => {
    expect(packed.filter((entry) => entry.startsWith(required))).not.toHaveLength(0);
  });

  it('excludes the TypeScript sources', () => {
    // A package with no `files` allowlist falls back to `.gitignore`, which ignores `dist/` and ships `src/`.
    expect(packed.filter((entry) => entry.startsWith('src/'))).toEqual([]);
  });

  it('excludes tests and test directories', () => {
    expect(packed.filter((entry) => entry.split('/').includes('__tests__'))).toEqual([]);
    expect(packed.filter((entry) => /\.test\.[cm]?[jt]s$/.test(entry))).toEqual([]);
  });
});

// region | Helpers

/** One workspace package that publishes, with the bin paths its manifest declares. */
interface PublishablePackage {
  readonly bins: ReadonlyArray<string>;
  readonly dir: string;
  readonly name: string;
}

/**
 * Lists the workspace packages that publish, discovered from the manifests so that a package dropping `private` is
 * covered without editing this suite.
 */
function findPublishablePackages(): ReadonlyArray<PublishablePackage> {
  const packages = readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const dir = path.join(packagesDir, entry.name);
      const manifest: unknown = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (typeof manifest !== 'object' || manifest === null) {
        return [];
      }
      const isPrivate = 'private' in manifest && manifest.private === true;
      const name = 'name' in manifest && typeof manifest.name === 'string' ? manifest.name : undefined;
      if (isPrivate || name === undefined) {
        return [];
      }
      return [{ bins: readBinPaths(manifest), dir, name }];
    });
  return packages.toSorted((a, b) => a.name.localeCompare(b.name));
}

/** Reads the bin target paths a manifest declares, tolerating both the string and object forms of the field. */
function readBinPaths(manifest: object): ReadonlyArray<string> {
  if (!('bin' in manifest)) {
    return [];
  }
  const { bin } = manifest;
  if (typeof bin === 'string') {
    return [bin];
  }
  if (typeof bin !== 'object' || bin === null) {
    return [];
  }
  const targets: ReadonlyArray<unknown> = Object.values(bin);
  return targets.filter((target): target is string => typeof target === 'string');
}

/**
 * Lists the paths `npm pack` would include for the package at `dir`. The dry run writes no tarball, so a failing
 * assertion cannot strand a `.tgz` in a package root.
 */
function readPackedPaths(dir: string): ReadonlyArray<string> {
  const stdout = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return readReportPaths(stdout);
}

/**
 * Reads the file list out of an `npm pack --json` report, throwing when the report is not shaped as expected. A
 * change in npm's output would otherwise yield an empty list, turning every exclusion assertion into a vacuous pass.
 */
function readReportPaths(stdout: string): ReadonlyArray<string> {
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new TypeError('`npm pack --json` returned no report.');
  }
  // `Array.isArray` narrows an `unknown` to `any[]`, so the explicit annotations here and below are what keep an
  // implicit `any` from flowing through every access and defeating the validation.
  const [report]: ReadonlyArray<unknown> = parsed;
  if (typeof report !== 'object' || report === null || !('files' in report)) {
    throw new TypeError('`npm pack --json` report carries no `files` array.');
  }
  const files: unknown = report.files;
  if (!Array.isArray(files)) {
    throw new TypeError('`npm pack --json` report carries no `files` array.');
  }
  const entries: ReadonlyArray<unknown> = files;
  return entries.map((file) => {
    if (typeof file !== 'object' || file === null || !('path' in file) || typeof file.path !== 'string') {
      throw new TypeError('`npm pack --json` report carries a file entry with no `path`.');
    }
    return file.path;
  });
}

// endregion | Helpers
