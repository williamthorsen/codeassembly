import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveHarnessPaths } from '../../../lib/harness.ts';
import { getManifestPath, writeManifest } from '../../../lib/manifest.ts';
import type { AgentsManifest, ManifestEntry } from '../../../lib/types.ts';
import {
  collectDeployedPaths,
  type DeployedPathSet,
  type DeployedPathSources,
  type ResolveSourceRoot,
} from '../collect-deployed-paths.ts';
import type { SyncDomain } from '../sync-domain.ts';

/** The directory to which a library-resolved artifact attributes, distinct from every declared source's. */
const LIBRARY_DIR = '/library/content';

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

  it('leaves out a rulebook that deploys no skill', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(skillsDir, 'ambient-only', 'SKILL.md'), 'body');
    const sources = {
      ...buildSources({ skillsDir }),
      resolved: [{ skill: false, skillName: 'ambient-only', source: undefined }],
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
      resolvedSubagents: [{ slug: 'prose-reviser', source: undefined }],
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

  it('attributes a declared skill to the directory of the source from which it resolved', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');
    await writeDeployedFile(path.join(skillsDir, 'plan', 'run.mjs'), 'code');
    const sources = buildSources({ skillsDir, skillSlugs: ['plan'], source: 'acme' });

    const set = await collectDeployedPaths(sources, projectDomain(baseDir), baseDir, resolveSourceRoot);

    expect(sourceRootsByKey(set)).toStrictEqual({
      'claude/skills/plan/SKILL.md': '/sources/acme',
      'claude/skills/plan/run.mjs': '/sources/acme',
    });
  });

  it('attributes a rulebook-delivered skill to the directory of the source from which it resolved', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(skillsDir, 'consult-comments', 'SKILL.md'), 'body');
    const sources = buildSources({ skillsDir, rulebookSkillNames: ['consult-comments'], source: 'acme' });

    const set = await collectDeployedPaths(sources, projectDomain(baseDir), baseDir, resolveSourceRoot);

    expect(sourceRootsByKey(set)).toStrictEqual({ 'claude/skills/consult-comments/SKILL.md': '/sources/acme' });
  });

  it('attributes a subagent to the directory of the source from which it resolved', async () => {
    const { subagentsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(subagentsDir, 'prose-reviser.md'), 'body');
    const sources = {
      ...buildSources({ skillsDir: '' }),
      harnessSubagentTargets: [{ harnessId: 'claude' as const, subagentsDir }],
      resolvedSubagents: [{ slug: 'prose-reviser', source: 'acme' }],
    };

    const set = await collectDeployedPaths(sources, projectDomain(baseDir), baseDir, resolveSourceRoot);

    expect(sourceRootsByKey(set)).toStrictEqual({ 'claude/agents/prose-reviser.md': '/sources/acme' });
  });

  it('attributes an artifact that resolved from no declared source to the library', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');

    const set = await collectDeployedPaths(
      buildSources({ skillsDir, skillSlugs: ['plan'] }),
      projectDomain(baseDir),
      baseDir,
      resolveSourceRoot,
    );

    expect(sourceRootsByKey(set)).toStrictEqual({ 'claude/skills/plan/SKILL.md': LIBRARY_DIR });
  });

  it('attributes a delivered support entry to no source, since no artifact backs it', async () => {
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

    expect(sourceRootsByKey(set)).toStrictEqual({ 'claude/skills/_sources/acme/guide.md': undefined });
  });

  it('attributes a manifest-contributed file to no source, since no artifact backs it', async () => {
    const { harnessHome } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(harnessHome, 'scripts', 'describe-change.mjs'), 'code');
    await writeInstallManifest(baseDir, [
      { relativePath: 'scripts/describe-change.mjs', contentHash: 'sha256:abc', linked: false },
    ]);

    const set = await collectDeployedPaths(
      buildSources({ skillsDir: '' }),
      homeDomain(baseDir),
      baseDir,
      resolveSourceRoot,
    );

    expect(sourceRootsByKey(set)).toStrictEqual({ 'claude/scripts/describe-change.mjs': undefined });
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

/** Plan sources naming one harness's skills dir, the declared skills deployed into it, and the rulebook skills. */
function buildSources(input: {
  skillsDir: string;
  skillSlugs?: ReadonlyArray<string>;
  rulebookSkillNames?: ReadonlyArray<string>;
  source?: string;
}): DeployedPathSources {
  return {
    ambientHosts: [],
    harnessSkillTargets: [{ harnessId: 'claude', skillsDir: input.skillsDir }],
    harnessSubagentTargets: [],
    resolved: (input.rulebookSkillNames ?? []).map((skillName) => ({ skill: true, skillName, source: input.source })),
    resolvedSkills: (input.skillSlugs ?? []).map((slug) => ({
      slug,
      srcDir: '',
      contentRoot: '',
      source: input.source,
    })),
    resolvedSubagents: [],
    sourceSupportPlans: [],
    targets: { harnessIds: ['claude'] },
  };
}

/** Maps each declared source's name to a directory named after it, and the library to its own. */
const resolveSourceRoot: ResolveSourceRoot = (source) => (source === undefined ? LIBRARY_DIR : `/sources/${source}`);

/** The home domain, whose base is the home directory that the collection is given. */
function homeDomain(homeDir: string): SyncDomain {
  return { baseDir: homeDir, ambient: 'harness-home', anchorBase: '~' };
}

/** The repo domain, rooted at the project directory under which the harness trees sit. */
function projectDomain(projectRoot: string): SyncDomain {
  return { baseDir: projectRoot, ambient: 'project-local', anchorBase: projectRoot };
}

/** The source root attributed to each collected file, keyed by the key under which it is recorded. */
function sourceRootsByKey(set: DeployedPathSet): Record<string, string | undefined> {
  return Object.fromEntries(set.files.map((file) => [file.key, file.sourceRoot]));
}

/** The collected keys, ordered so that an assertion does not depend on collection order. */
function sortedKeys(set: DeployedPathSet): ReadonlyArray<string> {
  return set.files.map((file) => file.key).toSorted();
}

/** Writes one deployed file, creating its enclosing directories. */
async function writeDeployedFile(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

/** Writes an install manifest naming `entries` as deployed into the Claude harness. */
async function writeInstallManifest(homeDir: string, entries: ReadonlyArray<ManifestEntry>): Promise<void> {
  const manifest: AgentsManifest = {
    schemaVersion: 2,
    harnesses: { claude: { harness: 'claude', version: '0.15.0', installedAt: '2026-09-19T08:00:00.000Z', entries } },
  };
  await writeManifest(getManifestPath(homeDir), manifest);
}

// endregion | Helpers
