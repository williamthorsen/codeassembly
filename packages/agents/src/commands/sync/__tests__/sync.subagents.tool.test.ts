import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { dedent } from '@williamthorsen/toolbelt.strings';
import { beforeEach, describe, expect, it } from 'vitest';

import { HARNESSES } from '../../../lib/harness.ts';
import { declareFixtureSource, FIXTURE_SOURCE_NAME } from '../../test-utils/declare-fixture-source.ts';
import { syncCommand } from '../sync.ts';
import { createSyncFixture } from '../test-utils/create-sync-fixture.ts';
import { renderReportText } from '../test-utils/render-report-text.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

describe(syncCommand, () => {
  const fixture = createSyncFixture();
  const { makeOptions, installBothHarnesses, writeFixtureRulebook, writeFixtureSupportFile, localHostPath, skillPath } =
    fixture;
  let projectRoot: string;
  let contentDir: string;
  let homeDir: string;

  beforeEach(() => {
    ({ projectRoot, contentDir, homeDir } = fixture);
  });
  describe('declared subagents', () => {
    const CLAUDE_OVERLAY = dedent`
      _defaults:
        permissionMode: bypassPermissions

    `;
    const ROVO_OVERLAY = dedent`
      _defaults:
        tools: [open_files]

    `;

    const subagentPath = (slug: string, dotDir = '.claude', subDir = 'agents'): string =>
      path.join(projectRoot, dotDir, subDir, `${slug}.md`);

    /** Writes the harness overlays supplying the `_defaults` applied by the subagent frontmatter merge. */
    async function writeOverlays(): Promise<void> {
      const dataDir = path.join(contentDir, 'subagents', '_data');
      await mkdir(dataDir, { recursive: true });
      await writeFile(path.join(dataDir, 'claude.yaml'), CLAUDE_OVERLAY, 'utf8');
      await writeFile(path.join(dataDir, 'rovo.yaml'), ROVO_OVERLAY, 'utf8');
    }

    /** Default fixture body, containing one tool token and one home-dir token for the transform to rewrite. */
    const SUBAGENT_BODY = 'Use {tool:Read}; run `{harness_home_dir}/scripts/x.sh`.';

    /** Writes a fixture subagent `<slug>.md` into the fixture source tree's `subagents/`. */
    async function writeFixtureSubagent(
      slug: string,
      { body = `# ${slug}\n\n${SUBAGENT_BODY}`, frontmatter = '' }: { body?: string; frontmatter?: string } = {},
    ): Promise<void> {
      const dir = path.join(contentDir, 'subagents');
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `${slug}.md`), `---\nname: ${slug}\n${frontmatter}---\n\n${body}\n`, 'utf8');
    }

    /** Writes the project-scope codeassembly.yaml declaring the fixture source and the given subagent slugs. */
    async function declareSubagents(...slugs: ReadonlyArray<string>): Promise<void> {
      const useBlock =
        slugs.length === 0 ? '  use: []\n' : `  use:\n${slugs.map((slug) => `    - ${slug}`).join('\n')}\n`;
      await declareFixtureSource(projectRoot, contentDir, `subagents:\n${useBlock}`);
    }

    it("resolves an inline support reference in a subagent to its source's project namespace", async () => {
      await writeOverlays();
      await writeFixtureSupportFile('_data/x.md');
      await writeFixtureSubagent('canary', { body: 'Read `{harness_home_dir}/skills/_data/x.md`.' });
      await declareSubagents('canary');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const supportFile = path.join(
        path.resolve(projectRoot),
        '.claude',
        'skills',
        '_sources',
        FIXTURE_SOURCE_NAME,
        '_data',
        'x.md',
      );
      expect(await readFile(subagentPath('canary'), 'utf8')).toContain(`Read \`${supportFile}\`.`);
    });

    it('anchors a project-deployed subagent link in the project, where the same run deploys the target', async () => {
      await writeOverlays();
      await writeFixtureSubagent('canary', { body: 'See [the skill](skills/commit/SKILL.md).' });
      await mkdir(path.join(contentDir, 'skills', 'commit'), { recursive: true });
      await writeFile(
        path.join(contentDir, 'skills', 'commit', 'SKILL.md'),
        '---\nname: commit\n---\n\n# Commit\n',
        'utf8',
      );
      await declareFixtureSource(
        projectRoot,
        contentDir,
        'skills:\n  use:\n    - commit\nsubagents:\n  use:\n    - canary\n',
      );

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const target = path.join(path.resolve(projectRoot), '.claude', 'skills', 'commit', 'SKILL.md');
      const deployed = await readFile(subagentPath('canary'), 'utf8');
      expect(deployed).toContain(`[the skill](${target})`);
      expect(existsSync(target)).toBe(true);
    });

    it('renders a subagent body rulebook token and deploys the target named by the token alone', async () => {
      await writeOverlays();
      await writeFixtureRulebook('nmr-scripts', 'delivery: skill', 'Run scripts with nmr.');
      await writeFixtureSubagent('canary', { body: 'See {rulebook:nmr-scripts}.' });
      await declareSubagents('canary');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const deployed = await readFile(subagentPath('canary'), 'utf8');
      expect(deployed).toContain('See /consult-nmr-scripts.');
      expect(existsSync(skillPath('consult-nmr-scripts'))).toBe(true);
    });

    it('compiles an injected rulebook into the deployed skills list and drops the source key', async () => {
      await writeOverlays();
      await writeFixtureRulebook('review-criteria', 'delivery: skill', 'Review with care.');
      await writeFixtureSubagent('canary', { frontmatter: 'rulebooks:\n  - review-criteria\n' });
      await declareSubagents('canary');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const deployed = await readFile(subagentPath('canary'), 'utf8');
      expect(deployed).toContain('skills:\n  - consult-review-criteria\n');
      expect(deployed).not.toContain('rulebooks:');
      expect(existsSync(skillPath('consult-review-criteria'))).toBe(true);
    });

    it('fails a dry run with nothing written when a subagent injects an ambient-only rulebook', async () => {
      await writeOverlays();
      await writeFixtureRulebook('review-criteria', 'delivery: ambient', 'Review with care.');
      await writeFixtureSubagent('canary', { frontmatter: 'rulebooks:\n  - review-criteria\n' });
      await declareSubagents('canary');

      await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
        /subagents\/canary\.md declares 1 unusable rulebook injection[\s\S]*names an ambient-only rulebook/,
      );
      expect(existsSync(subagentPath('canary'))).toBe(false);
    });

    it('fails a dry run with nothing written when a subagent body names an ambient-only rulebook', async () => {
      await writeOverlays();
      await writeFixtureRulebook('nmr-scripts', 'delivery: ambient', 'Run scripts with nmr.');
      await writeFixtureSubagent('canary', { body: 'See {rulebook:nmr-scripts}.' });
      await declareSubagents('canary');

      await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
        /\{rulebook:nmr-scripts\} in subagents\/canary\.md[\s\S]*names an ambient-only rulebook/,
      );
      expect(existsSync(subagentPath('canary'))).toBe(false);
    });

    it("fails a dry run with nothing written when a subagent body contains an anchor that doesn't name any heading", async () => {
      await writeOverlays();
      await writeFixtureSubagent('canary', { body: 'See [the findings](#finding-scheme).' });
      await declareSubagents('canary');

      await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
        /subagents\/canary\.md contains 1 unresolvable anchor link target/,
      );
      expect(existsSync(subagentPath('canary'))).toBe(false);
    });

    it('fails a real sync before the ambient host is written when a subagent body names an ambient-only rulebook', async () => {
      // Subagents deploy last, so this pins the failure ahead of the earlier ambient and skill write passes.
      await writeOverlays();
      await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
      await writeFixtureRulebook('nmr-scripts', 'delivery: ambient', 'Run scripts with nmr.');
      await writeFixtureSubagent('canary', { body: 'See {rulebook:nmr-scripts}.' });
      await declareFixtureSource(
        projectRoot,
        contentDir,
        'rulebooks:\n  use:\n    - alpha\nsubagents:\n  use:\n    - canary\n',
      );

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(
        /\{rulebook:nmr-scripts\} in subagents\/canary\.md/,
      );
      expect(existsSync(localHostPath())).toBe(false);
      expect(existsSync(subagentPath('canary'))).toBe(false);
    });

    it('deploys a declared subagent with the transform applied and the ownership marker but without a provenance marker', async () => {
      await writeOverlays();
      await writeFixtureSubagent('canary');
      await declareSubagents('canary');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const deployed = await readFile(subagentPath('canary'), 'utf8');
      expect(deployed).toContain('<!-- codeassembly-subagent:canary -->');
      expect(deployed).toContain('permissionMode: bypassPermissions');
      expect(deployed).toContain('Use Read;');
      expect(deployed).toContain('~/.claude/scripts/x.sh');
      expect(deployed).not.toContain('GENERATED FILE');
    });

    it('deploys a hook-bearing subagent without a directive, since `sync` binds nothing to the hook yet', async () => {
      await writeOverlays();
      await writeFixtureSubagent('canary', {
        body: '# canary\n\n<!-- guidance-hook: implementation-preferences -->\n\nBody.',
      });
      await declareSubagents('canary');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      const deployed = await readFile(subagentPath('canary'), 'utf8');
      expect(deployed).not.toContain('guidance-hook');
      expect(deployed).toContain('Body.');
    });

    it('when re-run with unchanged content, leaves the declared subagent file byte-identical and unwritten', async () => {
      await writeOverlays();
      await writeFixtureSubagent('canary');
      await declareSubagents('canary');
      await syncCommand(makeOptions(), projectRoot, homeDir);
      const firstBytes = await readFile(subagentPath('canary'), 'utf8');
      const firstMtime = statSync(subagentPath('canary')).mtimeMs;

      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(await readFile(subagentPath('canary'), 'utf8')).toBe(firstBytes);
      expect(statSync(subagentPath('canary')).mtimeMs).toBe(firstMtime);
    });

    it('retracts a declared subagent file once it is no longer declared', async () => {
      await writeOverlays();
      await writeFixtureSubagent('canary');
      await writeFixtureSubagent('other');
      await declareSubagents('canary', 'other');
      await syncCommand(makeOptions(), projectRoot, homeDir);
      expect(existsSync(subagentPath('other'))).toBe(true);

      await declareSubagents('canary');
      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(existsSync(subagentPath('other'))).toBe(false);
      expect(existsSync(subagentPath('canary'))).toBe(true);
    });

    it('never deletes a hand-authored subagent file that lacks the marker', async () => {
      await writeOverlays();
      const manual = subagentPath('manual');
      await mkdir(path.dirname(manual), { recursive: true });
      await writeFile(manual, '---\nname: manual\n---\n\n# Hand-authored\n', 'utf8');
      await writeFixtureSubagent('canary');
      await declareSubagents('canary');
      await syncCommand(makeOptions(), projectRoot, homeDir);

      await declareSubagents();
      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(existsSync(manual)).toBe(true);
      expect(existsSync(subagentPath('canary'))).toBe(false);
    });

    it("throws when a declared subagent doesn't resolve from any declared source, writing nothing", async () => {
      await writeOverlays();
      await declareSubagents('ghost');

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(/ghost/);
      expect(existsSync(subagentPath('ghost'))).toBe(false);
    });

    it('deploys the same subagent into each targeted harness with its own transform', async () => {
      await installBothHarnesses();
      await writeOverlays();
      await writeFixtureSubagent('canary');
      await declareSubagents('canary');

      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

      const claude = await readFile(subagentPath('canary', '.claude', 'agents'), 'utf8');
      const rovo = await readFile(subagentPath('canary', ROVO_HOME, 'subagents'), 'utf8');
      expect(claude).toContain('Use Read;');
      expect(claude).toContain('~/.claude/scripts/x.sh');
      expect(rovo).toContain('Use open_files;');
      expect(rovo).toContain(`~/${ROVO_HOME}/scripts/x.sh`);
    });

    it('previews declared-subagent writes and retractions in dry-run without writing', async () => {
      await writeOverlays();
      await writeFixtureSubagent('canary');
      await declareSubagents('canary');

      const output = renderReportText(await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir), {
        dryRun: true,
        level: 'info',
      });

      expect(output).toContain('canary');
      expect(existsSync(subagentPath('canary'))).toBe(false);
    });
  });

  describe('project Rovo Dev prompts.yml', () => {
    /** Writes a fixture skill into the fixture source tree, with optional extra frontmatter line(s). */
    async function writeFixtureSkill(slug: string, frontmatter = ''): Promise<void> {
      const dir = path.join(contentDir, 'skills', slug);
      await mkdir(dir, { recursive: true });
      const extra = frontmatter === '' ? '' : `${frontmatter}\n`;
      await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${slug}\n${extra}---\n\n# ${slug}\n\nBody.\n`, 'utf8');
    }

    /** Writes the project-scope codeassembly.yaml declaring the fixture source and the given skill slugs. */
    async function declareSkills(...slugs: ReadonlyArray<string>): Promise<void> {
      const useBlock =
        slugs.length === 0 ? '  use: []\n' : `  use:\n${slugs.map((slug) => `    - ${slug}`).join('\n')}\n`;
      await declareFixtureSource(projectRoot, contentDir, `skills:\n${useBlock}`);
    }

    const promptsYmlPath = (): string => path.join(projectRoot, ROVO_HOME, 'prompts.yml');

    /** Seeds a hand-authored `prompts.yml` containing a single foreign entry but not a codeassembly region. */
    async function seedHandAuthoredPromptsYml(): Promise<void> {
      await mkdir(path.join(projectRoot, ROVO_HOME), { recursive: true });
      await writeFile(
        promptsYmlPath(),
        "prompts:\n  - name: 'hand-authored'\n    description: 'kept'\n    content_file: custom.md\n",
        'utf8',
      );
    }

    it('writes a region indexing the user-invocable Rovo Dev skills, excluding non-invocable ones', async () => {
      await writeFixtureSkill('public-skill', 'description: Public skill');
      await writeFixtureSkill('internal-skill', 'user-invocable: false');
      await declareSkills('public-skill', 'internal-skill');

      await syncCommand(makeOptions({ harness: 'rovo' }), projectRoot, homeDir);

      const prompts = await readFile(promptsYmlPath(), 'utf8');
      expect(prompts).toContain('# codeassembly:managed:start');
      expect(prompts).toContain('# codeassembly:managed:end');
      expect(prompts).toContain("name: 'public-skill'");
      expect(prompts).toContain('content_file: skills/public-skill/SKILL.md');
      expect(prompts).not.toContain('internal-skill');
    });

    it('leaves prompts.yml byte-identical on a re-sync without any skill changes', async () => {
      await writeFixtureSkill('public-skill', 'description: Public skill');
      await declareSkills('public-skill');
      await syncCommand(makeOptions({ harness: 'rovo' }), projectRoot, homeDir);
      const first = await readFile(promptsYmlPath(), 'utf8');

      await syncCommand(makeOptions({ harness: 'rovo' }), projectRoot, homeDir);

      expect(await readFile(promptsYmlPath(), 'utf8')).toBe(first);
    });

    it('merges the region into a hand-authored prompts.yml, preserving foreign entries', async () => {
      await writeFixtureSkill('public-skill', 'description: Public skill');
      await declareSkills('public-skill');
      await seedHandAuthoredPromptsYml();

      await syncCommand(makeOptions({ harness: 'rovo' }), projectRoot, homeDir);

      const prompts = await readFile(promptsYmlPath(), 'utf8');
      expect(prompts).toContain("name: 'hand-authored'");
      expect(prompts).toContain('content_file: custom.md');
      expect(prompts).toContain("name: 'public-skill'");
      expect(prompts).toContain('# codeassembly:managed:start');
    });

    it('removes the region and deletes the file when undeclaring leaves nothing foreign', async () => {
      await writeFixtureSkill('public-skill', 'description: Public skill');
      await declareSkills('public-skill');
      await syncCommand(makeOptions({ harness: 'rovo' }), projectRoot, homeDir);
      expect(existsSync(promptsYmlPath())).toBe(true);

      await declareSkills();
      await syncCommand(makeOptions({ harness: 'rovo' }), projectRoot, homeDir);

      expect(existsSync(promptsYmlPath())).toBe(false);
    });

    it('strips only the region and keeps the file when foreign entries remain', async () => {
      await writeFixtureSkill('public-skill', 'description: Public skill');
      await declareSkills('public-skill');
      await seedHandAuthoredPromptsYml();
      await syncCommand(makeOptions({ harness: 'rovo' }), projectRoot, homeDir);
      expect(await readFile(promptsYmlPath(), 'utf8')).toContain('# codeassembly:managed:start');

      await declareSkills();
      await syncCommand(makeOptions({ harness: 'rovo' }), projectRoot, homeDir);

      const prompts = await readFile(promptsYmlPath(), 'utf8');
      expect(prompts).toContain("name: 'hand-authored'");
      expect(prompts).not.toContain('# codeassembly:managed:start');
    });

    it('refuses to corrupt a flow-style hand-authored prompts.yml, leaving it unchanged', async () => {
      await writeFixtureSkill('public-skill', 'description: Public skill');
      await declareSkills('public-skill');
      await mkdir(path.join(projectRoot, ROVO_HOME), { recursive: true });
      const flowAuthored = "prompts: [{ name: 'foreign', content_file: custom.md }]\n";
      await writeFile(promptsYmlPath(), flowAuthored, 'utf8');

      await expect(syncCommand(makeOptions({ harness: 'rovo' }), projectRoot, homeDir)).rejects.toThrow(/block-style/);

      expect(await readFile(promptsYmlPath(), 'utf8')).toBe(flowAuthored);
    });

    it("leaves a region-less prompts.yml untouched when the project doesn't declare any Rovo Dev skills", async () => {
      await seedHandAuthoredPromptsYml();
      const handAuthored = await readFile(promptsYmlPath(), 'utf8');
      await declareSkills();

      await syncCommand(makeOptions({ harness: 'rovo' }), projectRoot, homeDir);

      expect(await readFile(promptsYmlPath(), 'utf8')).toBe(handAuthored);
    });

    it('previews the prompts.yml reconciliation in dry-run without writing', async () => {
      await writeFixtureSkill('public-skill', 'description: Public skill');
      await declareSkills('public-skill');

      const output = renderReportText(
        await syncCommand(makeOptions({ harness: 'rovo', dryRun: true }), projectRoot, homeDir),
        { dryRun: true, level: 'info' },
      );

      expect(output).toContain('prompts.yml');
      expect(existsSync(promptsYmlPath())).toBe(false);
    });
  });
});
