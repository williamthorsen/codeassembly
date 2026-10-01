import { describe, expect, it, vi } from 'vitest';

import { bundleHelpers, findDriftedBundles, type RecordedBundles } from '../helper-bundler.ts';
import type { HelperTarget } from '../helper-manifest.ts';

const TARGET: HelperTarget = { entry: '../src/demo/cli.ts', entryPath: '/repo/src/demo/cli.ts', out: 'demo.mjs' };

describe(bundleHelpers, () => {
  it('does not import esbuild when there is no helper to build', async () => {
    const importEsbuild = vi.fn(() => Promise.reject(new Error('should not be imported')));

    await bundleHelpers([], '/out', importEsbuild);

    expect(importEsbuild).not.toHaveBeenCalled();
  });

  it('names the package to add when esbuild is not installed', async () => {
    const importEsbuild = () => Promise.reject(makeModuleNotFound('esbuild'));

    await expect(bundleHelpers([TARGET], '/out', importEsbuild)).rejects.toThrow(
      /^Bundling helpers needs esbuild, which isn't installed\. Add esbuild@\S+ as a devDependency/,
    );
  });

  it('rethrows the failure to resolve a module other than esbuild itself', async () => {
    const importEsbuild = () => Promise.reject(makeModuleNotFound('@esbuild/darwin-arm64'));

    await expect(bundleHelpers([TARGET], '/out', importEsbuild)).rejects.toThrow(/@esbuild\/darwin-arm64/);
  });
});

describe(findDriftedBundles, () => {
  it('reports nothing when every built bundle matches what git records', () => {
    const drifted = findDriftedBundles(
      makeBuiltBundles({ 'skills/one/one.mjs': 'alpha', 'scripts/two.mjs': 'beta' }),
      makeRecordedBundles({ 'skills/one/one.mjs': 'alpha', 'scripts/two.mjs': 'beta' }),
    );

    expect(drifted).toEqual([]);
  });

  it('reports a bundle whose recorded bytes differ from the fresh build', () => {
    const drifted = findDriftedBundles(
      makeBuiltBundles({ 'skills/one/one.mjs': 'rebuilt' }),
      makeRecordedBundles({ 'skills/one/one.mjs': 'stale' }),
    );

    expect(drifted).toEqual([{ out: 'skills/one/one.mjs', reason: 'differs' }]);
  });

  it('reports a bundle for which git records nothing', () => {
    const drifted = findDriftedBundles(makeBuiltBundles({ 'skills/new/new.mjs': 'alpha' }), makeRecordedBundles({}));

    expect(drifted).toEqual([{ out: 'skills/new/new.mjs', reason: 'unrecorded' }]);
  });

  it('reports a tracked bundle that no helper produces', () => {
    const drifted = findDriftedBundles(
      makeBuiltBundles({ 'skills/one/one.mjs': 'alpha' }),
      makeRecordedBundles({ 'skills/one/one.mjs': 'alpha', 'skills/gone/gone.mjs': 'orphan' }),
    );

    expect(drifted).toEqual([{ out: 'skills/gone/gone.mjs', reason: 'orphaned' }]);
  });
});

// region | Helpers

/** Builds the freshly-built bundle map from output paths to their contents. */
function makeBuiltBundles(contents: Record<string, string>): Map<string, Buffer> {
  return new Map(Object.entries(contents).map(([out, text]) => [out, Buffer.from(text, 'utf8')]));
}

/** Builds the error that Node raises when an import specifier does not resolve to any installed package. */
function makeModuleNotFound(specifier: string): Error {
  return Object.assign(new Error(`Cannot find package '${specifier}' imported from /repo/dist/esm/lib/x.js`), {
    code: 'ERR_MODULE_NOT_FOUND',
  });
}

/** Stands in for git's record, serving `contents` as both the recorded bytes and the tracked set. */
function makeRecordedBundles(contents: Record<string, string>): RecordedBundles {
  return {
    read: (out) => {
      const text = contents[out];
      return text === undefined ? undefined : Buffer.from(text, 'utf8');
    },
    tracked: Object.keys(contents),
  };
}

// endregion | Helpers
