import { describe, expect, it } from 'vitest';

import { findDriftedBundles, type RecordedBundles } from '../bundle-skill-helpers.ts';

describe(findDriftedBundles, () => {
  it('reports nothing when every built bundle matches what git records', () => {
    const drifted = findDriftedBundles(
      makeBuiltBundles({ 'content/skills/one/one.mjs': 'alpha', 'content/scripts/two.mjs': 'beta' }),
      makeRecordedBundles({ 'content/skills/one/one.mjs': 'alpha', 'content/scripts/two.mjs': 'beta' }),
    );

    expect(drifted).toEqual([]);
  });

  it('reports a bundle whose recorded bytes differ from the fresh build', () => {
    const drifted = findDriftedBundles(
      makeBuiltBundles({ 'content/skills/one/one.mjs': 'rebuilt' }),
      makeRecordedBundles({ 'content/skills/one/one.mjs': 'stale' }),
    );

    expect(drifted).toEqual([{ outFile: 'content/skills/one/one.mjs', reason: 'differs' }]);
  });

  it('reports a bundle git records nothing for', () => {
    const drifted = findDriftedBundles(
      makeBuiltBundles({ 'content/skills/new/new.mjs': 'alpha' }),
      makeRecordedBundles({}),
    );

    expect(drifted).toEqual([{ outFile: 'content/skills/new/new.mjs', reason: 'unrecorded' }]);
  });

  it('reports a tracked bundle that no target produces', () => {
    const drifted = findDriftedBundles(
      makeBuiltBundles({ 'content/skills/one/one.mjs': 'alpha' }),
      makeRecordedBundles({ 'content/skills/one/one.mjs': 'alpha', 'content/skills/gone/gone.mjs': 'orphan' }),
    );

    expect(drifted).toEqual([{ outFile: 'content/skills/gone/gone.mjs', reason: 'orphaned' }]);
  });
});

// region | Helpers

/** Builds the freshly-built bundle map from output paths to their contents. */
function makeBuiltBundles(contents: Record<string, string>): Map<string, Buffer> {
  return new Map(Object.entries(contents).map(([outFile, text]) => [outFile, Buffer.from(text, 'utf8')]));
}

/** Stands in for git's record, serving `contents` as both the recorded bytes and the tracked set. */
function makeRecordedBundles(contents: Record<string, string>): RecordedBundles {
  return {
    read: (outFile) => {
      const text = contents[outFile];
      return text === undefined ? undefined : Buffer.from(text, 'utf8');
    },
    tracked: Object.keys(contents),
  };
}

// endregion | Helpers
