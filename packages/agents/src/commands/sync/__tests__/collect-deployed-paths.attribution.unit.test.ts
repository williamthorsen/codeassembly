import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveHarnessPaths } from '../../../lib/harness.ts';
import { type AuthoredSource, collectDeployedPaths, type DeployedPathSet } from '../collect-deployed-paths.ts';
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
      resolvedSubagents: [subagent('prose-reviser', 'acme')],
    };

    const set = await collectDeployedPaths(sources, projectDomain(baseDir), baseDir, resolveSourceRoot);

    expect(sourceRootsByKey(set)).toStrictEqual({ 'claude/agents/prose-reviser.md': '/sources/acme' });
  });

  it('does not attribute a delivered support entry to any source, since it is not backed by any artifact', async () => {
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

  it('names the authored file and content root behind a deployed skill body, and nothing else in its directory', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');
    await writeDeployedFile(path.join(skillsDir, 'plan', 'run.mjs'), 'code');
    await writeDeployedFile(path.join(skillsDir, 'plan', 'references', 'notes.md'), 'notes');

    const set = await collectDeployedPaths(
      buildSources({ skillsDir, skillSlugs: ['plan'] }),
      projectDomain(baseDir),
      baseDir,
      resolveSourceRoot,
    );

    expect(authoredByKey(set)).toStrictEqual({
      'claude/skills/plan/SKILL.md': {
        file: path.join(DEFAULT_SOURCE_DIR, 'skills', 'plan', 'SKILL.md'),
        contentRoot: DEFAULT_SOURCE_DIR,
        sourceName: DEFAULT_SOURCE,
      },
      'claude/skills/plan/references/notes.md': undefined,
      'claude/skills/plan/run.mjs': undefined,
    });
  });

  it('names the authored rulebook behind a rulebook-delivered skill body', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(skillsDir, 'consult-comments', 'SKILL.md'), 'body');
    const sources = buildSources({ skillsDir, rulebookSkillNames: ['consult-comments'], source: 'acme' });

    const set = await collectDeployedPaths(sources, projectDomain(baseDir), baseDir, resolveSourceRoot);

    expect(authoredByKey(set)).toStrictEqual({
      'claude/skills/consult-comments/SKILL.md': {
        file: path.join('/sources/acme', 'guidance', 'rulebooks', 'consult-comments.md'),
        contentRoot: '/sources/acme',
        sourceName: 'acme',
      },
    });
  });

  it('names the authored file and content root behind a deployed subagent file', async () => {
    const { subagentsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(subagentsDir, 'prose-reviser.md'), 'body');
    const sources = {
      ...buildSources({ skillsDir: '' }),
      harnessSubagentTargets: [{ harnessId: 'claude' as const, subagentsDir }],
      resolvedSubagents: [subagent('prose-reviser')],
    };

    const set = await collectDeployedPaths(sources, projectDomain(baseDir), baseDir, resolveSourceRoot);

    expect(authoredByKey(set)).toStrictEqual({
      'claude/agents/prose-reviser.md': {
        file: path.join(DEFAULT_SOURCE_DIR, 'subagents', 'prose-reviser.md'),
        contentRoot: DEFAULT_SOURCE_DIR,
        sourceName: DEFAULT_SOURCE,
      },
    });
  });

  it('does not name an authored source for a delivered support entry, which does not render from any authored document', async () => {
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

    expect(authoredByKey(set)).toStrictEqual({ 'claude/skills/_sources/acme/guide.md': undefined });
  });

  it('does not name an authored source for a manifest-contributed file', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', baseDir);
    await writeDeployedFile(path.join(skillsDir, '_data', 'work-types.json'), '{}');
    await writeInstallManifest(baseDir, [
      { relativePath: 'skills/_data', contentHash: 'sha256:dir:skills/_data', linked: false },
    ]);

    const set = await collectDeployedPaths(
      buildSources({ skillsDir: '' }),
      homeDomain(baseDir),
      baseDir,
      resolveSourceRoot,
    );

    expect(authoredByKey(set)).toStrictEqual({ 'claude/skills/_data/work-types.json': undefined });
  });

  it('does not attribute a manifest-contributed file to any source, since it is not backed by any artifact', async () => {
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
});

// region | Helpers

/** The authored source attributed to each collected file, keyed by the key under which it is recorded. */
function authoredByKey(set: DeployedPathSet): Record<string, AuthoredSource | undefined> {
  return Object.fromEntries(set.files.map((file) => [file.key, file.authored]));
}

/** The source root attributed to each collected file, keyed by the key under which it is recorded. */
function sourceRootsByKey(set: DeployedPathSet): Record<string, string | undefined> {
  return Object.fromEntries(set.files.map((file) => [file.key, file.sourceRoot]));
}

// endregion | Helpers
