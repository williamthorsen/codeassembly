import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type * as Esbuild from 'esbuild';

import type { HelperTarget } from './helper-manifest.ts';
import { resolveRunningPackageRoot } from './running-package.ts';
import { isRecord } from './type-guards.ts';

/** A bundle whose recorded state no longer matches the helpers that produce it. */
export interface BundleDrift {
  /** Path to the bundle, relative to the content root. */
  readonly out: string;
  readonly reason: DriftReason;
}

export type DriftReason = 'differs' | 'orphaned' | 'unrecorded';

/** Imports the esbuild module; the default imports the installed peer. */
export type EsbuildImporter = () => Promise<typeof Esbuild>;

/** The bundles that git records at `HEAD`, which a fresh build is checked against. */
export interface RecordedBundles {
  /** Returns the bytes that git records for a bundle, or `undefined` when it records none. */
  read: (out: string) => Buffer | undefined;
  /** Every `.mjs` under the content root that `HEAD` records, relative to the root. */
  tracked: readonly string[];
}

/**
 * Bundles each helper into a self-contained `.mjs` at `outRoot/<out>`, so that it runs under `node` without any of its
 * dependencies installed. The options are the tool's and not a repository's, so every content root bundles alike.
 * esbuild is imported only when there is a helper to build.
 */
export async function bundleHelpers(
  targets: ReadonlyArray<HelperTarget>,
  outRoot: string,
  importEsbuild: EsbuildImporter = importInstalledEsbuild,
): Promise<void> {
  if (targets.length === 0) {
    return;
  }

  const { build } = await loadEsbuild(importEsbuild);
  for (const target of targets) {
    await build({
      entryPoints: [target.entryPath],
      outfile: path.join(outRoot, target.out),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'es2022',
      banner: { js: REQUIRE_SHIM },
      minify: true,
      // Keeps a deployed helper's stack traces legible.
      keepNames: true,
      // Resolve a workspace dependency from its `source` `.ts` export condition so that the bundle does not require
      // that package to be pre-built.
      conditions: ['source'],
    });
  }
}

/**
 * Builds every helper into a temporary directory and reports each bundle under `contentRoot` that has drifted from
 * what git records at `HEAD`. The working tree is not a usable comparison target, since a build rewrites it in place.
 */
export async function checkHelperBundles(
  contentRoot: string,
  targets: ReadonlyArray<HelperTarget>,
  importEsbuild: EsbuildImporter = importInstalledEsbuild,
): Promise<BundleDrift[]> {
  const recorded = readRecordedBundles(contentRoot);
  const outRoot = await mkdtemp(path.join(tmpdir(), 'helper-bundles-'));
  try {
    await bundleHelpers(targets, outRoot, importEsbuild);
    const built = new Map<string, Buffer>();
    for (const target of targets) {
      built.set(target.out, await readFile(path.join(outRoot, target.out)));
    }
    return findDriftedBundles(built, recorded);
  } finally {
    await rm(outRoot, { force: true, recursive: true });
  }
}

/** Compares freshly built bundles against what git records, returning every bundle that drifted. */
export function findDriftedBundles(built: ReadonlyMap<string, Buffer>, recorded: RecordedBundles): BundleDrift[] {
  const drifted: BundleDrift[] = [];

  for (const [out, bytes] of built) {
    const recordedBytes = recorded.read(out);
    if (recordedBytes === undefined) {
      drifted.push({ out, reason: 'unrecorded' });
    } else if (!recordedBytes.equals(bytes)) {
      drifted.push({ out, reason: 'differs' });
    }
  }

  for (const out of recorded.tracked) {
    if (!built.has(out)) {
      drifted.push({ out, reason: 'orphaned' });
    }
  }

  return drifted;
}

/**
 * Reads the bundles that git records at `HEAD` under `contentRoot`. Throws when the root is not inside a git work tree
 * with a commit, since there is then no record to compare against.
 */
export function readRecordedBundles(contentRoot: string): RecordedBundles {
  try {
    runGit(contentRoot, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  } catch (error: unknown) {
    throw new Error(
      `The bundle check compares against git's HEAD, but ${contentRoot} is not inside a git work tree with a commit.`,
      { cause: error },
    );
  }

  return {
    // A `./` path after the colon resolves against the working directory, which here is the content root.
    read: (out) => {
      try {
        return runGit(contentRoot, ['cat-file', 'blob', `HEAD:./${out}`]);
      } catch {
        return;
      }
    },
    tracked: runGit(contentRoot, ['ls-tree', '-r', '--name-only', 'HEAD', '--', '.'])
      .toString('utf8')
      .split('\n')
      .filter((line) => line.endsWith('.mjs')),
  };
}

/**
 * Output cap for one git invocation, sized well past a bundle. The 1 MiB default throws `ENOBUFS` on a larger blob,
 * which `read` cannot distinguish from an absent one, so the check would report a recorded bundle as unrecorded.
 */
const GIT_MAX_BUFFER = 64 * 1_024 * 1_024;

// A CommonJS dependency (`yaml`) imports Node built-ins via bare `require('process')` calls.
// esbuild's ESM output otherwise doesn't define `require`, so this banner restores a real one via `createRequire`.
const REQUIRE_SHIM =
  "import { createRequire as __cjsCreateRequire } from 'node:module';\nconst require = __cjsCreateRequire(import.meta.url);";

// region | Helpers

/** Renders the esbuild version range that this tool declares as its peer, or `undefined` when it cannot be read. */
async function describePeerRange(): Promise<string | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path.join(resolveRunningPackageRoot(), 'package.json'), 'utf8'));
    const peers = isRecord(parsed) ? parsed.peerDependencies : undefined;
    const range = isRecord(peers) ? peers.esbuild : undefined;
    return typeof range === 'string' ? range : undefined;
  } catch {
    return;
  }
}

/** Imports the esbuild peer from wherever the running tool resolves its dependencies. */
async function importInstalledEsbuild(): Promise<typeof Esbuild> {
  return await import('esbuild');
}

/** Reports whether `error` is the failure to resolve esbuild itself, rather than a module that esbuild imports. */
function isMissingEsbuild(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'ERR_MODULE_NOT_FOUND' &&
    error.message.includes("'esbuild'")
  );
}

/** Imports esbuild, turning its absence into an error that names the package to add. */
async function loadEsbuild(importEsbuild: EsbuildImporter): Promise<typeof Esbuild> {
  try {
    return await importEsbuild();
  } catch (error: unknown) {
    if (!isMissingEsbuild(error)) {
      throw error;
    }
    const range = await describePeerRange();
    const spec = range === undefined ? 'esbuild' : `esbuild@${range}`;
    throw new Error(
      `Bundling helpers needs esbuild, which isn't installed. Add ${spec} as a devDependency of the package that builds the helpers.`,
      { cause: error },
    );
  }
}

/** Runs git in `cwd` and returns its stdout. Throws when git exits non-zero. */
function runGit(cwd: string, args: readonly string[]): Buffer {
  return execFileSync('git', args, { cwd, maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
}

// endregion | Helpers
