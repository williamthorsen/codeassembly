import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveHarnessPaths } from '../../../lib/harness.ts';
import { collectDeployedPaths, type DeployedPathSet } from '../collect-deployed-paths.ts';
import {
  buildSources,
  DEFAULT_SOURCE,
  DEFAULT_SOURCE_DIR,
  homeDomain,
  projectDomain,
  resolveSourceRoot,
  subagent,
  writeDeployedFile,
  writeInstallManifest,
} from '../test-utils/deployed-path-sources.ts';

describe(collectDeployedPaths, () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), 'collect-deployed-'));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('collects every file of a declared skill directory, at every depth', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');
    await writeDeployedFile(path.join(skillsDir, 'plan', 'references', 'notes.md'), 'notes');
    await writeDeployedFile(path.join(skillsDir, 'plan', 'run.mjs'), 'code');

    const set = await collectDeployedPaths(
      buildSources({ skillsDir, skillSlugs: ['plan'] }),
      projectDomain(baseDir),
      baseDir,
      resolveSourceRoot,
    );

    expect(sortedKeys(set)).toEqual([
      'claude/skills/plan/SKILL.md',
      'claude/skills/plan/references/notes.md',
      'claude/skills/plan/run.mjs',
    ]);
  });

  it('classifies a Markdown file as a document and everything else as an asset', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');
    await writeDeployedFile(path.join(skillsDir, 'plan', 'run.mjs'), 'code');

    const set = await collectDeployedPaths(
      buildSources({ skillsDir, skillSlugs: ['plan'] }),
      projectDomain(baseDir),
      baseDir,
      resolveSourceRoot,
    );

    expect(set.files.map((file) => `${file.key} ${file.kind}`).toSorted()).toEqual([
      'claude/skills/plan/SKILL.md document',
      'claude/skills/plan/run.mjs asset',
    ]);
  });

  it('leaves a harness file that neither the plan nor the manifest names out of the set', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');
    await writeDeployedFile(path.join(skillsDir, 'plugin-skill', 'SKILL.md'), 'not ours');

    const set = await collectDeployedPaths(
      buildSources({ skillsDir, skillSlugs: ['plan'] }),
      projectDomain(baseDir),
      baseDir,
      resolveSourceRoot,
    );

    expect(sortedKeys(set)).toEqual(['claude/skills/plan/SKILL.md']);
  });

  it('collects a rulebook-delivered skill under the name that it deploys as', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(skillsDir, 'consult-comments', 'SKILL.md'), 'body');
    const sources = buildSources({ skillsDir, rulebookSkillNames: ['consult-comments'] });

    const set = await collectDeployedPaths(sources, projectDomain(baseDir), baseDir, resolveSourceRoot);

    expect(sortedKeys(set)).toEqual(['claude/skills/consult-comments/SKILL.md']);
  });

  it('leaves out a rulebook that does not deploy a skill', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(skillsDir, 'ambient-only', 'SKILL.md'), 'body');
    const sources = {
      ...buildSources({ skillsDir }),
      resolved: [
        {
          skill: false,
          skillName: 'ambient-only',
          source: DEFAULT_SOURCE,
          srcPath: path.join(DEFAULT_SOURCE_DIR, 'guidance', 'rulebooks', 'ambient-only.md'),
          contentRoot: DEFAULT_SOURCE_DIR,
        },
      ],
    };

    const set = await collectDeployedPaths(sources, projectDomain(baseDir), baseDir, resolveSourceRoot);

    expect(set.files).toEqual([]);
  });

  it('leaves out a rulebook skill on a harness that the rulebook excludes', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(skillsDir, 'consult-rovo-only', 'SKILL.md'), 'body');
    const sources = {
      ...buildSources({ skillsDir }),
      resolved: [
        {
          skill: true,
          skillName: 'consult-rovo-only',
          source: DEFAULT_SOURCE,
          srcPath: path.join(DEFAULT_SOURCE_DIR, 'guidance', 'rulebooks', 'rovo-only.md'),
          contentRoot: DEFAULT_SOURCE_DIR,
          targetHarnesses: ['rovo' as const],
        },
      ],
    };

    const set = await collectDeployedPaths(sources, projectDomain(baseDir), baseDir, resolveSourceRoot);

    expect(set.files).toEqual([]);
  });

  it('collects each delivered support entry named by a source support plan', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', baseDir);
    const destDir = path.join(skillsDir, '_sources', 'acme');
    await writeDeployedFile(path.join(destDir, 'guide.md'), 'guide');
    const sources = {
      ...buildSources({ skillsDir }),
      sourceSupportPlans: [
        {
          sourcesRoot: path.join(skillsDir, '_sources'),
          name: 'acme',
          destDir,
          entries: [{ relPath: 'guide.md' }],
          kind: 'deliver' as const,
        },
      ],
    };

    const set = await collectDeployedPaths(sources, projectDomain(baseDir), baseDir, resolveSourceRoot);

    expect(sortedKeys(set)).toEqual(['claude/skills/_sources/acme/guide.md']);
  });

  it('collects each deployed subagent file', async () => {
    const { subagentsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(subagentsDir, 'prose-reviser.md'), 'body');
    const sources = {
      ...buildSources({ skillsDir: '' }),
      harnessSubagentTargets: [{ harnessId: 'claude' as const, subagentsDir }],
      resolvedSubagents: [subagent('prose-reviser')],
    };

    const set = await collectDeployedPaths(sources, projectDomain(baseDir), baseDir, resolveSourceRoot);

    expect(sortedKeys(set)).toEqual(['claude/agents/prose-reviser.md']);
  });

  it('reports the ambient hosts separately from the deployed files', async () => {
    const hostPath = path.join(baseDir, 'CLAUDE.local.md');
    const sources = { ...buildSources({ skillsDir: '' }), ambientHosts: [{ hostPath }] };

    const set = await collectDeployedPaths(sources, projectDomain(baseDir), baseDir, resolveSourceRoot);

    expect(set).toEqual({ files: [], ambientHostPaths: [hostPath] });
  });

  it('collects what the install manifest names in the home domain', async () => {
    const { harnessHome, skillsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(skillsDir, '_data', 'work-types.json'), '{}');
    await writeDeployedFile(path.join(harnessHome, 'scripts', 'describe-change.mjs'), 'code');
    await writeInstallManifest(baseDir, [
      { relativePath: 'skills/_data', contentHash: 'sha256:dir:skills/_data', linked: false },
      { relativePath: 'scripts/describe-change.mjs', contentHash: 'sha256:abc', linked: false },
    ]);

    const set = await collectDeployedPaths(
      buildSources({ skillsDir: '' }),
      homeDomain(baseDir),
      baseDir,
      resolveSourceRoot,
    );

    expect(sortedKeys(set)).toEqual(['claude/scripts/describe-change.mjs', 'claude/skills/_data/work-types.json']);
  });

  it('skips a manifest entry naming a file that no longer exists', async () => {
    const { harnessHome } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(harnessHome, 'scripts', 'present.mjs'), 'code');
    await writeInstallManifest(baseDir, [
      { relativePath: 'scripts/present.mjs', contentHash: 'sha256:abc', linked: false },
      { relativePath: 'skills/removed', contentHash: 'sha256:dir:skills/removed', linked: false },
      { relativePath: 'scripts/gone.mjs', contentHash: 'sha256:def', linked: false },
    ]);

    const set = await collectDeployedPaths(
      buildSources({ skillsDir: '' }),
      homeDomain(baseDir),
      baseDir,
      resolveSourceRoot,
    );

    expect(sortedKeys(set)).toEqual(['claude/scripts/present.mjs']);
  });

  it('reads the plan alone in the repo domain, leaving the home manifest out', async () => {
    const { harnessHome } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(harnessHome, 'scripts', 'describe-change.mjs'), 'code');
    await writeInstallManifest(baseDir, [
      { relativePath: 'scripts/describe-change.mjs', contentHash: 'sha256:abc', linked: false },
    ]);

    const set = await collectDeployedPaths(
      buildSources({ skillsDir: '' }),
      projectDomain(baseDir),
      baseDir,
      resolveSourceRoot,
    );

    expect(set.files).toEqual([]);
  });
});

// region | Helpers

/** The collected keys, ordered so that an assertion does not depend on collection order. */
function sortedKeys(set: DeployedPathSet): ReadonlyArray<string> {
  return set.files.map((file) => file.key).toSorted();
}

// endregion | Helpers
