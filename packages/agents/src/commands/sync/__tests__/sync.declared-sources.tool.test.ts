import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { declareFixtureSource, FIXTURE_SOURCE_NAME } from '../../test-utils/declare-fixture-source.ts';
import { syncCommand } from '../sync.ts';
import { createSyncFixture } from '../test-utils/create-sync-fixture.ts';
import { renderReportLines } from '../test-utils/render-report-lines.ts';
import { renderReportText } from '../test-utils/render-report-text.ts';

/** True on a platform where the process can lower a directory's permissions and be blocked by them (i.e. non-root). */
const canEnforceDirPermissions = process.getuid !== undefined && process.getuid() !== 0;

describe(syncCommand, () => {
  const fixture = createSyncFixture();
  const { makeOptions, writeFixtureRulebook, localHostPath, skillPath } = fixture;
  let projectRoot: string;
  let contentDir: string;
  let homeDir: string;

  beforeEach(() => {
    ({ projectRoot, contentDir, homeDir } = fixture);
  });
  describe('declared sources', () => {
    let sourceDir: string;

    beforeEach(async () => {
      sourceDir = path.join(tmpdir(), `agents-test-sync-source-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await mkdir(path.join(sourceDir, 'guidance', 'rulebooks'), { recursive: true });
    });

    afterEach(async () => {
      await rm(sourceDir, { recursive: true, force: true });
    });

    /** Writes a fixture rulebook into the temp source dir, shaped exactly like a fixture rulebook. */
    async function writeSourceRulebook(slug: string, frontmatter: string, body: string): Promise<void> {
      const file = path.join(sourceDir, 'guidance', 'rulebooks', `${slug}.md`);
      await writeFile(file, `---\nslug: ${slug}\n${frontmatter}\n---\n\n${body}\n`, 'utf8');
    }

    /** Writes a fixture skill into the temp source dir's `skills/<slug>/SKILL.md`. */
    async function writeSourceSkill(slug: string): Promise<void> {
      const dir = path.join(sourceDir, 'skills', slug);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${slug}\n---\n\n# ${slug}\n`, 'utf8');
    }

    /** Writes a support file under a source's `skills/` directory, creating parents as needed. */
    async function writeSourceSupport(relPath: string, content: string): Promise<void> {
      const full = path.join(sourceDir, 'skills', relPath);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content, 'utf8');
    }

    /** Writes the project codeassembly.yaml declaring the fixture source, an `org` source above it, and `body`. */
    async function declareWithSource(body: string, dir = sourceDir): Promise<void> {
      await declareFixtureSource(projectRoot, contentDir, `sources:\n  - name: org\n    path: ${dir}\n${body}`);
    }

    it('deploys a rulebook that exists only in a declared source, body from the source', async () => {
      await writeSourceRulebook('source-only', 'delivery: skill\ndescription: From org.', 'Org rules.');
      await declareWithSource('rulebooks:\n  use:\n    - source-only\n');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const skill = await readFile(skillPath('consult-source-only'), 'utf8');
      expect(skill).toContain('description: From org.');
      expect(skill).toContain('Org rules.');
    });

    it('delivers an ambient source rulebook to the local host and retracts it on removal', async () => {
      await writeSourceRulebook('ambient-src', 'delivery: ambient', 'Ambient org rules.');
      await declareWithSource('rulebooks:\n  use:\n    - ambient-src\n');
      await syncCommand(makeOptions(), projectRoot, homeDir);

      const localHost = await readFile(localHostPath(), 'utf8');
      expect(localHost).toContain('<!-- rulebook:ambient-src -->');
      expect(localHost).toContain('Ambient org rules.');

      await declareWithSource('rulebooks:\n  use: []\n');
      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(await readFile(localHostPath(), 'utf8')).not.toContain('<!-- rulebook:ambient-src -->');
    });

    it('prefers a source rulebook over a same-slug rulebook in a lower-precedence source', async () => {
      await writeFixtureRulebook('shadowed', 'delivery: ambient', 'Fixture body.');
      await writeSourceRulebook('shadowed', 'delivery: ambient', 'Source body.');
      await declareWithSource('rulebooks:\n  use:\n    - shadowed\n');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(await readFile(localHostPath(), 'utf8')).toContain('Source body.');
    });

    it('warns and resolves from the remaining source when a declared source directory does not exist', async () => {
      const missingDir = path.join(sourceDir, 'missing');
      await writeFixtureRulebook('unpopulated', 'delivery: ambient', 'Fixture body.');
      await declareWithSource('rulebooks:\n  use:\n    - unpopulated\n', missingDir);

      const outcome = await syncCommand(makeOptions(), projectRoot, homeDir);

      const warning = renderReportText(outcome, { level: 'warn' });
      expect(warning).toContain(`Declared source "org" (${missingDir}) does not exist`);
      expect(warning).toContain('Create the directory');
      expect(warning).toContain('correct the source');
      expect(await readFile(localHostPath(), 'utf8')).toContain('Fixture body.');
    });

    it('warns once per missing source, naming each declared path', async () => {
      const firstDir = path.join(sourceDir, 'first-missing');
      const secondDir = path.join(sourceDir, 'second-missing');
      await declareFixtureSource(
        projectRoot,
        contentDir,
        `sources:\n  - name: org\n    path: ${firstDir}\n  - name: team\n    path: ${secondDir}\nrulebooks:\n  use: []\n`,
      );

      const outcome = await syncCommand(makeOptions(), projectRoot, homeDir);

      const warnings = renderReportLines(outcome, { level: 'warn' }).filter((line) => line.includes('does not exist'));
      expect(warnings).toHaveLength(2);
      expect(warnings.join('\n')).toContain(firstDir);
      expect(warnings.join('\n')).toContain(secondDir);
    });

    it('warns about a missing declared source under --dry-run', async () => {
      const missingDir = path.join(sourceDir, 'missing');
      await declareWithSource('rulebooks:\n  use: []\n', missingDir);

      const outcome = await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir);

      expect(renderReportText(outcome, { dryRun: true, level: 'warn' })).toContain(
        `Declared source "org" (${missingDir}) does not exist`,
      );
    });

    it('fails the run when a declared source path is a file, not a directory', async () => {
      const filePath = path.join(sourceDir, 'a-file');
      await writeFile(filePath, 'not a dir\n', 'utf8');
      await declareWithSource('rulebooks:\n  use: []\n', filePath);

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(/not a directory/);
    });

    it.runIf(canEnforceDirPermissions)(
      'fails the run with a clear error naming a declared source that is unreadable',
      async () => {
        const outer = path.join(sourceDir, 'outer');
        const inner = path.join(outer, 'inner');
        await mkdir(inner, { recursive: true });
        await chmod(outer, 0o000);
        await declareWithSource('rulebooks:\n  use: []\n', inner);

        try {
          await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(
            /Invalid declared source.*"org".*unreadable/s,
          );
        } finally {
          await chmod(outer, 0o755);
        }
      },
    );

    // The source root itself is unreadable while its parent stays searchable, so `stat` still reports it as a
    // directory. Without a declared rulebook to probe inside it, only the up-front readability check catches it.
    it.runIf(canEnforceDirPermissions)(
      'fails the run when a declared source root is itself unreadable, even with nothing declared to resolve',
      async () => {
        const locked = path.join(sourceDir, 'locked');
        await mkdir(locked, { recursive: true });
        await chmod(locked, 0o000);
        await declareWithSource('rulebooks:\n  use: []\n', locked);

        try {
          await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(
            /Invalid declared source.*"org".*unreadable/s,
          );
        } finally {
          await chmod(locked, 0o755);
        }
      },
    );

    it('fails the run when a declared source declares an unsupported content format', async () => {
      await writeFile(path.join(sourceDir, 'codeassembly-content.yaml'), 'format: 3\n', 'utf8');
      await declareWithSource('rulebooks:\n  use: []\n');

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(
        /Unsupported content format.*"org".*3.*supports content formats 1 and 2/s,
      );
    });

    it('fails a dry run, writing nothing, when a declared source declares an unsupported content format', async () => {
      await writeFile(path.join(sourceDir, 'codeassembly-content.yaml'), 'format: 3\n', 'utf8');
      await declareWithSource('rulebooks:\n  use: []\n');

      await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
        /Unsupported content format/,
      );
      expect(existsSync(path.join(projectRoot, '.claude'))).toBe(false);
    });

    it('fails the run when a lower-precedence declared source declares an unsupported content format', async () => {
      await writeFile(path.join(contentDir, 'codeassembly-content.yaml'), 'format: 3\n', 'utf8');
      await declareWithSource('rulebooks:\n  use: []\n');

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(
        new RegExp(`Unsupported content format.*${contentDir}`, 's'),
      );
    });

    it('fails the run when a declared source contains a manifest that will not parse', async () => {
      await writeFile(path.join(sourceDir, 'codeassembly-content.yaml'), 'format: [1\n', 'utf8');
      await declareWithSource('rulebooks:\n  use: []\n');

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(
        /Unreadable content manifest.*"org"/s,
      );
    });

    it('syncs a declared source that declares a supported content format', async () => {
      await writeFile(path.join(sourceDir, 'codeassembly-content.yaml'), 'format: 1\n', 'utf8');
      await writeSourceRulebook('source-only', 'delivery: skill\ndescription: From org.', 'Org rules.');
      await declareWithSource('rulebooks:\n  use:\n    - source-only\n');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(await readFile(skillPath('consult-source-only'), 'utf8')).toContain('Org rules.');
    });

    it('deploys a declared source skill from its source into the harness skills dir', async () => {
      await writeSourceSkill('source-skill');
      await declareWithSource('skills:\n  use:\n    - source-skill\n');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(await readFile(skillPath('source-skill'), 'utf8')).toContain('<!-- codeassembly-skill:source-skill -->');
    });

    it('fails the run with nothing written when a source name cannot name a directory', async () => {
      await declareFixtureSource(
        projectRoot,
        contentDir,
        `sources:\n  - name: ../escape\n    path: ${sourceDir}\nrulebooks:\n  use: []\n`,
      );

      await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
        /Unusable declared source name.*\.\.\/escape.*relative path segment/s,
      );
    });

    it('retracts a scope directory left empty when its package drops its last support entry', async () => {
      const scopedDir = `${sourceDir}-scoped`;
      await mkdir(path.join(scopedDir, 'skills', '_data'), { recursive: true });
      await writeFile(path.join(scopedDir, 'skills', '_data', 'a.md'), '# A\n', 'utf8');

      try {
        await declareFixtureSource(
          projectRoot,
          contentDir,
          `sources:\n  - name: '@acme/guidance'\n    path: ${scopedDir}\nrulebooks:\n  use: []\n`,
        );
        await syncCommand(makeOptions(), projectRoot, homeDir);
        const sourcesRoot = path.join(projectRoot, '.claude', 'skills', '_sources');
        expect(existsSync(path.join(sourcesRoot, '@acme', 'guidance', '_data', 'a.md'))).toBe(true);

        await rm(path.join(scopedDir, 'skills', '_data'), { recursive: true });
        await syncCommand(makeOptions(), projectRoot, homeDir);

        expect(existsSync(sourcesRoot)).toBe(false);
      } finally {
        await rm(scopedDir, { recursive: true, force: true });
      }
    });

    it("delivers a source's skill support entries into that source's namespace", async () => {
      await writeSourceSupport('_data/house-style.md', '# House style\n');
      await declareWithSource('rulebooks:\n  use: []\n');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const delivered = path.join(projectRoot, '.claude', 'skills', '_sources', 'org', '_data', 'house-style.md');
      expect(await readFile(delivered, 'utf8')).toContain('# House style');
    });

    it("resolves a source skill's link into its own support entry at the deployed location", async () => {
      await mkdir(path.join(sourceDir, 'skills', 'org-skill'), { recursive: true });
      await writeFile(
        path.join(sourceDir, 'skills', 'org-skill', 'SKILL.md'),
        '---\nname: org-skill\n---\n\nSee [house style](../_data/house-style.md).\n',
        'utf8',
      );
      await writeSourceSupport('_data/house-style.md', '# House style\n');
      await declareWithSource('skills:\n  use:\n    - org-skill\n');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const target = path.join(
        path.resolve(projectRoot),
        '.claude',
        'skills',
        '_sources',
        'org',
        '_data',
        'house-style.md',
      );
      expect(await readFile(skillPath('org-skill'), 'utf8')).toContain(`[house style](${target})`);
      expect(existsSync(target)).toBe(true);
    });

    it("resolves a source rulebook's link into its own support entry at the deployed location", async () => {
      await writeSourceRulebook(
        'org-rules',
        'delivery: skill\ndescription: Org rules.',
        'Follow [house style](../../skills/_data/house-style.md).',
      );
      await writeSourceSupport('_data/house-style.md', '# House style\n');
      await declareWithSource('rulebooks:\n  use:\n    - org-rules\n');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const target = path.join(
        path.resolve(projectRoot),
        '.claude',
        'skills',
        '_sources',
        'org',
        '_data',
        'house-style.md',
      );
      expect(await readFile(skillPath('consult-org-rules'), 'utf8')).toContain(`[house style](${target})`);
      expect(existsSync(target)).toBe(true);
    });

    it('keeps three sources from masking one another', async () => {
      const otherDir = `${sourceDir}-other`;
      await writeSourceSupport('_data/shared.md', 'From org.\n');
      await mkdir(path.join(otherDir, 'skills', '_data'), { recursive: true });
      await writeFile(path.join(otherDir, 'skills', '_data', 'shared.md'), 'From other.\n', 'utf8');
      await mkdir(path.join(contentDir, 'skills', '_data'), { recursive: true });
      await writeFile(path.join(contentDir, 'skills', '_data', 'shared.md'), 'From fixture.\n', 'utf8');
      await declareFixtureSource(
        projectRoot,
        contentDir,
        `sources:\n  - name: org\n    path: ${sourceDir}\n  - name: other\n    path: ${otherDir}\nrulebooks:\n  use: []\n`,
      );

      try {
        await syncCommand(makeOptions(), projectRoot, homeDir);

        const sourcesRoot = path.join(projectRoot, '.claude', 'skills', '_sources');
        expect(await readFile(path.join(sourcesRoot, 'org', '_data', 'shared.md'), 'utf8')).toContain('From org.');
        expect(await readFile(path.join(sourcesRoot, 'other', '_data', 'shared.md'), 'utf8')).toContain('From other.');
        expect(await readFile(path.join(sourcesRoot, FIXTURE_SOURCE_NAME, '_data', 'shared.md'), 'utf8')).toContain(
          'From fixture.',
        );
      } finally {
        await rm(otherDir, { recursive: true, force: true });
      }
    });

    it('retracts the support entries a dropped source delivered', async () => {
      await writeSourceSupport('_data/house-style.md', '# House style\n');
      await declareWithSource('rulebooks:\n  use: []\n');
      await syncCommand(makeOptions(), projectRoot, homeDir);
      const sourcesRoot = path.join(projectRoot, '.claude', 'skills', '_sources');
      expect(existsSync(path.join(sourcesRoot, 'org'))).toBe(true);

      await declareFixtureSource(projectRoot, contentDir, 'rulebooks:\n  use: []\n');
      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(existsSync(sourcesRoot)).toBe(false);
    });

    it('names the support deliveries a real run would make in a dry run, writing nothing', async () => {
      await writeSourceSupport('_data/house-style.md', '# House style\n');
      await declareWithSource('rulebooks:\n  use: []\n');

      const output = renderReportText(await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir), {
        dryRun: true,
        level: 'info',
      });

      expect(output).toContain(
        `deliver 1 source support file(s) to ${path.join(projectRoot, '.claude', 'skills', '_sources', 'org')}`,
      );
      expect(existsSync(path.join(projectRoot, '.claude', 'skills', '_sources'))).toBe(false);
    });

    // The preview is computed before delivery and the run acts after it, so a renamed source is the shape that catches
    // a preview judging the tree that it is about to change: The incoming namespace does not exist yet.
    it('names only the outgoing namespace when a source is renamed', async () => {
      await writeSourceSupport('_data/house-style.md', '# House style\n');
      await declareWithSource('rulebooks:\n  use: []\n');
      await syncCommand(makeOptions(), projectRoot, homeDir);
      const sourcesRoot = path.join(projectRoot, '.claude', 'skills', '_sources');
      await declareFixtureSource(
        projectRoot,
        contentDir,
        `sources:\n  - name: renamed\n    path: ${sourceDir}\nrulebooks:\n  use: []\n`,
      );

      const output = renderReportText(await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir), {
        dryRun: true,
        level: 'info',
      });

      expect(output).toContain(`retract source support ${path.join(sourcesRoot, 'org')} (no longer declared)`);
      expect(output).not.toContain(`retract source support ${sourcesRoot} (`);
    });

    it('names the namespace that a still-declared source empties', async () => {
      await writeSourceSupport('_data/house-style.md', '# House style\n');
      await declareWithSource('rulebooks:\n  use: []\n');
      await syncCommand(makeOptions(), projectRoot, homeDir);
      const sourcesRoot = path.join(projectRoot, '.claude', 'skills', '_sources');
      await rm(path.join(sourceDir, 'skills', '_data'), { recursive: true });

      const output = renderReportText(await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir), {
        dryRun: true,
        level: 'info',
      });

      expect(output).toContain(`retract source support ${path.join(sourcesRoot, 'org')} (source ships none)`);
      await syncCommand(makeOptions(), projectRoot, homeDir);
      expect(existsSync(path.join(sourcesRoot, 'org'))).toBe(false);
    });

    it('names the source-support retraction that a real run would perform, writing nothing', async () => {
      await writeSourceSupport('_data/house-style.md', '# House style\n');
      await declareWithSource('rulebooks:\n  use: []\n');
      await syncCommand(makeOptions(), projectRoot, homeDir);
      const sourcesRoot = path.join(projectRoot, '.claude', 'skills', '_sources');
      await declareFixtureSource(projectRoot, contentDir, 'rulebooks:\n  use: []\n');

      const output = renderReportText(await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir), {
        dryRun: true,
        level: 'info',
      });

      expect(output).toContain(`retract source support ${sourcesRoot} (no longer declared)`);
      expect(existsSync(path.join(sourcesRoot, 'org', '_data', 'house-style.md'))).toBe(true);
    });

    it('deploys a declared source subagent from its source into the harness subagents dir', async () => {
      await mkdir(path.join(sourceDir, 'subagents'), { recursive: true });
      await writeFile(
        path.join(sourceDir, 'subagents', 'source-agent.md'),
        '---\nname: source-agent\ndescription: Org agent\n---\n\n# Source agent\n',
        'utf8',
      );
      await declareWithSource('subagents:\n  use:\n    - source-agent\n');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const deployed = await readFile(path.join(projectRoot, '.claude', 'agents', 'source-agent.md'), 'utf8');
      expect(deployed).toContain('<!-- codeassembly-subagent:source-agent -->');
    });

    it('deploys a source skill over a same-slug skill in a lower-precedence source', async () => {
      const fixtureSkillDir = path.join(contentDir, 'skills', 'shared-skill');
      await mkdir(fixtureSkillDir, { recursive: true });
      await writeFile(
        path.join(fixtureSkillDir, 'SKILL.md'),
        '---\nname: shared-skill\n---\n\n# Fixture shared skill\n',
        'utf8',
      );
      const sourceSkillDir = path.join(sourceDir, 'skills', 'shared-skill');
      await mkdir(sourceSkillDir, { recursive: true });
      await writeFile(
        path.join(sourceSkillDir, 'SKILL.md'),
        '---\nname: shared-skill\n---\n\n# Source shared skill\n',
        'utf8',
      );
      await declareWithSource('skills:\n  use:\n    - shared-skill\n');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(await readFile(skillPath('shared-skill'), 'utf8')).toContain('# Source shared skill');
    });

    it('rejects an invalid source in dry-run, before previewing any write', async () => {
      const filePath = path.join(sourceDir, 'a-file');
      await writeFile(filePath, 'not a dir\n', 'utf8');
      await declareWithSource('rulebooks:\n  use: []\n', filePath);

      await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
        /Invalid declared source/,
      );
    });

    it('reports each artifact origin in dry-run, flagging a source rulebook that shadows a lower-precedence source', async () => {
      await writeFixtureRulebook('shadowed', 'delivery: ambient', 'Fixture body.');
      await writeSourceRulebook('shadowed', 'delivery: ambient', 'Source body.');
      await writeFixtureRulebook('fixture-only', 'delivery: ambient', 'Fixture only.');
      await declareWithSource('rulebooks:\n  use:\n    - shadowed\n    - fixture-only\n');

      const output = renderReportText(await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir), {
        dryRun: true,
        level: 'info',
      });

      expect(output).toContain('[dry-run] sync would resolve:');
      expect(output).toMatch(/shadowed\s+← source "org" \(shadows source "codeassembly"\)/);
      expect(output).toMatch(/fixture-only\s+← source "codeassembly"$/m);
    });

    it('reports declared skill and subagent origins in the dry-run resolution report', async () => {
      await writeSourceSkill('source-skill');
      await mkdir(path.join(sourceDir, 'subagents'), { recursive: true });
      await writeFile(
        path.join(sourceDir, 'subagents', 'source-agent.md'),
        '---\nname: source-agent\ndescription: Org agent\n---\n\n# Source agent\n',
        'utf8',
      );
      await declareWithSource('skills:\n  use:\n    - source-skill\nsubagents:\n  use:\n    - source-agent\n');

      const output = renderReportText(await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir), {
        dryRun: true,
        level: 'info',
      });

      expect(output).toMatch(/skill\s+source-skill\s+← source "org"/);
      expect(output).toMatch(/subagent\s+source-agent\s+← source "org"/);
    });

    it('warns on a real run when a source rulebook shadows a lower-precedence source', async () => {
      await writeFixtureRulebook('shadowed', 'delivery: ambient', 'Fixture body.');
      await writeSourceRulebook('shadowed', 'delivery: ambient', 'Source body.');
      await declareWithSource('rulebooks:\n  use:\n    - shadowed\n');

      const output = renderReportText(await syncCommand(makeOptions(), projectRoot, homeDir), {
        level: 'warn',
      });

      expect(output).toContain(
        '1 artifact shadows a lower-precedence source: rulebook "shadowed" (source "org" over source "codeassembly")',
      );
    });

    it("does not warn on a real run when a lower-precedence source doesn't ship the same slug", async () => {
      await writeSourceRulebook('source-only', 'delivery: ambient', 'Org rules.');
      await declareWithSource('rulebooks:\n  use:\n    - source-only\n');

      const output = renderReportText(await syncCommand(makeOptions(), projectRoot, homeDir), {
        level: 'warn',
      });

      expect(output).not.toContain('shadows a lower-precedence source');
    });
  });
});
