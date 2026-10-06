import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { HARNESSES } from '../../../lib/harness.ts';
import { declareFixtureSource, FIXTURE_SOURCE_NAME } from '../../test-utils/declare-fixture-source.ts';
import { syncCommand } from '../sync.ts';
import { createSyncFixture } from '../test-utils/create-sync-fixture.ts';
import { renderReportText } from '../test-utils/render-report-text.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

describe(syncCommand, () => {
  const fixture = createSyncFixture();
  const { makeOptions, installBothHarnesses, writeFixtureRulebook, writeFixtureSupportFile, skillPath } = fixture;
  let projectRoot: string;
  let contentDir: string;
  let homeDir: string;

  beforeEach(() => {
    ({ projectRoot, contentDir, homeDir } = fixture);
  });
  describe('declared skills', () => {
    /** Writes a fixture skill into the fixture source tree's `skills/<slug>/SKILL.md`. */
    async function writeFixtureSkill(
      slug: string,
      { body = `# ${slug}\n\nBody.` }: { body?: string } = {},
    ): Promise<void> {
      const dir = path.join(contentDir, 'skills', slug);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${slug}\n---\n\n${body}\n`, 'utf8');
    }

    /** Writes the project-scope codeassembly.yaml declaring the fixture source and the given skill slugs. */
    async function declareSkills(...slugs: ReadonlyArray<string>): Promise<void> {
      const useBlock =
        slugs.length === 0 ? '  use: []\n' : `  use:\n${slugs.map((slug) => `    - ${slug}`).join('\n')}\n`;
      await declareFixtureSource(projectRoot, contentDir, `skills:\n${useBlock}`);
    }

    /** Writes the project-scope codeassembly.yaml declaring the fixture source plus a body that mixes types. */
    async function declareRaw(content: string): Promise<void> {
      await declareFixtureSource(projectRoot, contentDir, content);
    }

    it('renders a skill body rulebook token and deploys the target named by the token alone', async () => {
      await writeFixtureRulebook('nmr-scripts', 'delivery: skill', 'Run scripts with nmr.');
      await writeFixtureSkill('people-report', { body: 'See {rulebook:nmr-scripts}.' });
      await declareSkills('people-report');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const deployed = await readFile(skillPath('people-report'), 'utf8');
      expect(deployed).toContain('See /consult-nmr-scripts.');
      expect(existsSync(skillPath('consult-nmr-scripts'))).toBe(true);
    });

    it('fails a dry run with nothing written when a skill body names an ambient-only rulebook', async () => {
      await writeFixtureRulebook('nmr-scripts', 'delivery: ambient', 'Run scripts with nmr.');
      await writeFixtureSkill('people-report', { body: 'See {rulebook:nmr-scripts}.' });
      await declareSkills('people-report');

      await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
        /\{rulebook:nmr-scripts\} in skills\/people-report\/SKILL\.md[\s\S]*names an ambient-only rulebook/,
      );
      expect(existsSync(skillPath('people-report'))).toBe(false);
    });

    it("fails a dry run with nothing written when a skill body contains an anchor that doesn't name any heading", async () => {
      await writeFixtureSkill('people-report', { body: 'See [the events](#lifecycle-events).' });
      await declareSkills('people-report');

      await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
        /skills\/people-report\/SKILL\.md contains 1 unresolvable anchor link target/,
      );
      expect(existsSync(skillPath('people-report'))).toBe(false);
    });

    it('deploys a declared skill into the project-local skills dir with the ownership marker', async () => {
      await writeFixtureSkill('people-report');
      await declareSkills('people-report');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const skill = await readFile(skillPath('people-report'), 'utf8');
      expect(skill).toContain('<!-- codeassembly-skill:people-report -->');
      expect(skill).toContain('# people-report');
    });

    it('deploys a hook-bearing skill without a directive, since `sync` binds nothing to the hook yet', async () => {
      await writeFixtureSkill('people-report', {
        body: '# people-report\n\n<!-- guidance-hook: implementation-preferences -->\n\nBody.',
      });
      await declareSkills('people-report');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const skill = await readFile(skillPath('people-report'), 'utf8');
      expect(skill).not.toContain('guidance-hook');
      expect(skill).toContain('Body.');
    });

    it('fails a dry run with nothing written when a skill declares the same hook twice', async () => {
      await writeFixtureSkill('people-report', {
        body: '<!-- guidance-hook: preferences -->\n<!-- guidance-hook: preferences -->',
      });
      await declareSkills('people-report');

      await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
        /skills\/people-report\/SKILL\.md:\d+ name="preferences" .*reason=duplicate-hook/,
      );
      expect(existsSync(skillPath('people-report'))).toBe(false);
    });

    it('when re-run with unchanged content, does not rewrite the declared skill file', async () => {
      await writeFixtureSkill('people-report');
      await declareSkills('people-report');
      await syncCommand(makeOptions(), projectRoot, homeDir);
      const firstMtime = statSync(skillPath('people-report')).mtimeMs;

      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(statSync(skillPath('people-report')).mtimeMs).toBe(firstMtime);
    });

    it('retracts a declared skill directory once it is no longer declared', async () => {
      await writeFixtureSkill('people-report');
      await writeFixtureSkill('other');
      await declareSkills('people-report', 'other');
      await syncCommand(makeOptions(), projectRoot, homeDir);
      expect(existsSync(skillPath('other'))).toBe(true);

      await declareSkills('people-report');
      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(existsSync(path.dirname(skillPath('other')))).toBe(false);
      expect(existsSync(skillPath('people-report'))).toBe(true);
    });

    it('never deletes a hand-authored skill when retracting declared skills', async () => {
      const manual = skillPath('manual');
      await mkdir(path.dirname(manual), { recursive: true });
      await writeFile(manual, '---\nname: manual\n---\n\n# Hand-authored\n', 'utf8');
      await writeFixtureSkill('people-report');
      await declareSkills('people-report');
      await syncCommand(makeOptions(), projectRoot, homeDir);

      await declareSkills();
      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(existsSync(manual)).toBe(true);
      expect(existsSync(path.dirname(skillPath('people-report')))).toBe(false);
    });

    it("throws when a declared skill doesn't resolve from any declared source, writing nothing", async () => {
      await declareSkills('ghost');

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(/ghost/);
      expect(existsSync(skillPath('ghost'))).toBe(false);
    });

    it('deploys declared skills and rulebook skills side by side without clobbering each other', async () => {
      await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
      await writeFixtureSkill('people-report');
      await declareRaw('rulebooks:\n  use:\n    - gamma\nskills:\n  use:\n    - people-report\n');
      await syncCommand(makeOptions(), projectRoot, homeDir);
      expect(await readFile(skillPath('consult-gamma'), 'utf8')).toContain('<!-- codeassembly-rulebook:gamma -->');
      expect(await readFile(skillPath('people-report'), 'utf8')).toContain('<!-- codeassembly-skill:people-report -->');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(existsSync(skillPath('consult-gamma'))).toBe(true);
      expect(existsSync(skillPath('people-report'))).toBe(true);
    });

    it('errors when a declared skill and a rulebook skill would share a directory name', async () => {
      await writeFixtureRulebook('foo', 'delivery: skill\nskill-name: shared', 'Foo rules.');
      await writeFixtureSkill('shared');
      await declareRaw('rulebooks:\n  use:\n    - foo\nskills:\n  use:\n    - shared\n');

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(/collision/i);
      expect(existsSync(skillPath('shared'))).toBe(false);
    });

    it('previews declared-skill writes and retractions in dry-run without writing', async () => {
      await writeFixtureSkill('people-report');
      await declareSkills('people-report');

      const output = renderReportText(await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir), {
        dryRun: true,
        level: 'info',
      });

      expect(output).toContain('people-report');
      expect(existsSync(skillPath('people-report'))).toBe(false);
    });

    it('applies include expansion and tool-name and link rewriting when deploying a declared skill', async () => {
      const skillDir = path.join(contentDir, 'skills', 'demo');
      await mkdir(path.join(skillDir, '_partials'), { recursive: true });
      await writeFile(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: demo\n---\n\n<!-- include: _partials/frag.md / -->\n\nUse {tool:Read}. See [guide](./guide.md).\n',
        'utf8',
      );
      await writeFile(path.join(skillDir, '_partials', 'frag.md'), 'Shared fragment.\n', 'utf8');
      await writeFile(path.join(skillDir, 'guide.md'), '# Guide\n', 'utf8');
      await declareSkills('demo');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const skill = await readFile(skillPath('demo'), 'utf8');
      expect(skill).toContain('Shared fragment.');
      expect(skill).toContain('Use Read.');
      // Anchored in the project, where this same run deployed the target, rather than in the home harness dir that
      // a project sync never populates.
      expect(skill).toContain(`[guide](${path.resolve(projectRoot)}/.claude/skills/demo/guide.md)`);
      expect(skill).not.toContain('{tool:Read}');
      expect(existsSync(path.join(projectRoot, '.claude', 'skills', 'demo', '_partials'))).toBe(false);
    });

    it('leaves a link to a skill that this run does not deploy anchored at the harness home', async () => {
      await writeFixtureSkill('demo', { body: 'See [the other one](../undeclared-skill/SKILL.md).' });
      await writeFixtureSkill('undeclared-skill');
      await declareSkills('demo');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      // The target exists in the content root but is undeclared, so it isn't in any project tree. Re-pointing the link
      // there would make it unresolvable outright; the harness home is where an installed copy can still answer it.
      expect(await readFile(skillPath('demo'), 'utf8')).toContain(
        '[the other one](~/.claude/skills/undeclared-skill/SKILL.md)',
      );
    });

    it('resolves each inline harness-home reference to where its target deploys', async () => {
      await writeFixtureSupportFile('_data/x.md');
      await writeFixtureSkill('demo', {
        body: [
          'Read `{harness_home_dir}/skills/_data/x.md`.',
          'Run `{harness_home_dir}/skills/helper/SKILL.md` and `{harness_home_dir}/skills/elsewhere/SKILL.md`.',
          'Run `{harness_home_dir}/scripts/demo.sh`.',
        ].join('\n'),
      });
      await writeFixtureSkill('helper');
      await declareSkills('demo', 'helper');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const skillsDir = path.join(path.resolve(projectRoot), '.claude', 'skills');
      const body = await readFile(skillPath('demo'), 'utf8');
      expect(body).toContain(`Read \`${skillsDir}/_sources/${FIXTURE_SOURCE_NAME}/_data/x.md\`.`);
      expect(body).toContain(`Run \`${skillsDir}/helper/SKILL.md\` and \`~/.claude/skills/elsewhere/SKILL.md\`.`);
      expect(body).toContain('Run `~/.claude/scripts/demo.sh`.');
    });

    it('fails before writing when a declared skill has an unmapped tool placeholder, dry-run included', async () => {
      await writeFixtureSkill('demo', { body: 'Use {tool:NoSuchTool}.' });
      await declareSkills('demo');

      await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
        /Unmapped tool name "NoSuchTool" in skills\/demo\/SKILL\.md/,
      );
      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(/Unmapped tool name "NoSuchTool"/);
      expect(existsSync(skillPath('demo'))).toBe(false);
    });
  });

  describe('harness-targeted skills', () => {
    /** Writes a fixture skill `<slug>/SKILL.md`, with an optional `supported-harnesses:` line and body override. */
    async function writeFixtureSkill(
      slug: string,
      { supportedHarnesses, body }: { supportedHarnesses?: string; body?: string } = {},
    ): Promise<void> {
      const dir = path.join(contentDir, 'skills', slug);
      await mkdir(dir, { recursive: true });
      const harnessLine = supportedHarnesses === undefined ? '' : `supported-harnesses: ${supportedHarnesses}\n`;
      const content = body ?? `# ${slug}\n\nBody.`;
      await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${slug}\n${harnessLine}---\n\n${content}\n`, 'utf8');
    }

    /** Writes the project-scope codeassembly.yaml declaring the fixture source and the given skill slugs. */
    async function declareSkills(...slugs: ReadonlyArray<string>): Promise<void> {
      const useBlock =
        slugs.length === 0 ? '  use: []\n' : `  use:\n${slugs.map((slug) => `    - ${slug}`).join('\n')}\n`;
      await declareFixtureSource(projectRoot, contentDir, `skills:\n${useBlock}`);
    }

    it('deploys a harness-targeted skill only into its target harness, and an all-harness skill into both', async () => {
      await installBothHarnesses();
      await writeFixtureSkill('rovo-only', { supportedHarnesses: '[rovo]' });
      await writeFixtureSkill('everywhere');
      await declareSkills('rovo-only', 'everywhere');

      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

      expect(existsSync(skillPath('rovo-only', ROVO_HOME))).toBe(true);
      expect(existsSync(skillPath('rovo-only', '.claude'))).toBe(false);
      expect(existsSync(skillPath('everywhere', '.claude'))).toBe(true);
      expect(existsSync(skillPath('everywhere', ROVO_HOME))).toBe(true);
    });

    it('retracts a skill from a harness that it no longer targets while keeping it where it still does', async () => {
      await installBothHarnesses();
      await writeFixtureSkill('was-everywhere');
      await declareSkills('was-everywhere');
      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);
      expect(existsSync(skillPath('was-everywhere', '.claude'))).toBe(true);
      expect(existsSync(skillPath('was-everywhere', ROVO_HOME))).toBe(true);

      await writeFixtureSkill('was-everywhere', { supportedHarnesses: '[rovo]' });
      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

      expect(existsSync(path.dirname(skillPath('was-everywhere', '.claude')))).toBe(false);
      expect(existsSync(skillPath('was-everywhere', ROVO_HOME))).toBe(true);
    });
  });
});
