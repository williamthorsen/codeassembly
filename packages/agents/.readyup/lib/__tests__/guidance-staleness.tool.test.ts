import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { countMeaningfulCommits, formatUtcDate, readGuidanceStaleness } from '../guidance-staleness.ts';
import { createGuidanceRepoFixture } from '../test-utils/create-guidance-repo-fixture.ts';

const GUIDANCE_PATH = 'AGENTS.md';

describe(readGuidanceStaleness, () => {
  it('counts the commits that landed after the guidance file was last modified', async () => {
    const { commitFiles, root } = await createGuidanceRepoFixture();
    await commitFiles(GUIDANCE_PATH);
    await commitFiles('source.ts');
    await commitFiles('other.ts');

    const staleness = await readGuidanceStaleness(root, GUIDANCE_PATH);

    expect(staleness?.meaningfulCommitCount).toBe(2);
  });

  it('does not count the commit that modified the guidance file', async () => {
    const { commitFiles, root } = await createGuidanceRepoFixture();
    await commitFiles('source.ts');
    await commitFiles(GUIDANCE_PATH);

    const staleness = await readGuidanceStaleness(root, GUIDANCE_PATH);

    expect(staleness?.meaningfulCommitCount).toBe(0);
  });

  it('does not count a commit touching only package manifests and lockfiles', async () => {
    const { commitFiles, root } = await createGuidanceRepoFixture();
    await commitFiles(GUIDANCE_PATH);
    await commitFiles('package.json', 'pnpm-lock.yaml');

    const staleness = await readGuidanceStaleness(root, GUIDANCE_PATH);

    expect(staleness?.meaningfulCommitCount).toBe(0);
  });

  it('counts a commit touching a manifest alongside other files', async () => {
    const { commitFiles, root } = await createGuidanceRepoFixture();
    await commitFiles(GUIDANCE_PATH);
    await commitFiles('package.json', 'source.ts');

    const staleness = await readGuidanceStaleness(root, GUIDANCE_PATH);

    expect(staleness?.meaningfulCommitCount).toBe(1);
  });

  it('reports when the guidance file was last modified', async () => {
    const { commitFiles, root } = await createGuidanceRepoFixture();
    const beforeEpochSec = Math.floor(Date.now() / 1_000);
    await commitFiles(GUIDANCE_PATH);

    const staleness = await readGuidanceStaleness(root, GUIDANCE_PATH);

    expect(staleness?.lastModifiedEpochSec).toBeGreaterThanOrEqual(beforeEpochSec);
  });

  it('measures nothing when the guidance file has no history', async () => {
    const { commitFiles, root } = await createGuidanceRepoFixture();
    await commitFiles('source.ts');

    expect(await readGuidanceStaleness(root, GUIDANCE_PATH)).toBeUndefined();
  });

  it('measures nothing outside a git repository', async () => {
    const { root } = await createGuidanceRepoFixture();

    expect(await readGuidanceStaleness(join(root, 'not-a-repo'), GUIDANCE_PATH)).toBeUndefined();
  });
});

describe(countMeaningfulCommits, () => {
  it('counts nothing in an empty log', () => {
    expect(countMeaningfulCommits('')).toBe(0);
  });

  it('counts a commit whose files are all meaningful', () => {
    expect(countMeaningfulCommits('COMMIT\nsource.ts\n')).toBe(1);
  });

  it('counts a trailing commit that no blank line follows', () => {
    expect(countMeaningfulCommits('COMMIT\nfirst.ts\n\nCOMMIT\nsecond.ts')).toBe(2);
  });

  it('counts nothing for a commit touching only a nested manifest or lockfile', () => {
    expect(countMeaningfulCommits('COMMIT\npackages/agents/package.json\npackages/agents/pnpm-lock.yaml\n')).toBe(0);
  });

  it('counts a commit touching a file whose name merely ends in a manifest name', () => {
    expect(countMeaningfulCommits('COMMIT\nfixtures/broken-package.json\n')).toBe(1);
  });
});

describe(formatUtcDate, () => {
  it('renders an epoch as a UTC calendar date', () => {
    expect(formatUtcDate(1_785_866_083)).toBe('2026-08-04');
  });
});
