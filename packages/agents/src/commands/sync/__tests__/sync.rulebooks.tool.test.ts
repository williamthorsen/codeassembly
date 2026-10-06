import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { beforeEach, describe, expect, it } from 'vitest';

import { HARNESSES } from '../../../lib/harness.ts';
import { declareFixtureSource, FIXTURE_SOURCE_NAME } from '../../test-utils/declare-fixture-source.ts';
import { syncCommand } from '../sync.ts';
import { isSyncValidationError } from '../sync-validation-error.ts';
import { createSyncFixture } from '../test-utils/create-sync-fixture.ts';
import { renderReportText } from '../test-utils/render-report-text.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

describe(syncCommand, () => {
  const fixture = createSyncFixture();
  const {
    makeOptions,
    installBothHarnesses,
    writeFixtureRulebook,
    writeFixtureSupportFile,
    declareRulebooks,
    writeLocalDeclaration,
    declarationPath,
    localDeclarationPath,
    localHostPath,
    skillPath,
  } = fixture;
  let projectRoot: string;
  let contentDir: string;
  let homeDir: string;

  beforeEach(() => {
    ({ projectRoot, contentDir, homeDir } = fixture);
  });
  it("throws when a declared rulebook doesn't resolve from any declared source", async () => {
    await declareRulebooks('ghost');

    await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(/ghost/);
  });

  it('writes a skill file for a skill-only rulebook without delivering it as ambient', async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill\ndescription: Gamma desc.', 'Gamma rules.');
    await declareRulebooks('gamma');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(localHostPath())).toBe(false);
    const skill = await readFile(skillPath('consult-gamma'), 'utf8');
    expect(skill).toContain('name: consult-gamma');
    expect(skill).toContain('description: Gamma desc.');
    expect(skill).toContain('<!-- codeassembly-rulebook:gamma -->');
    expect(skill).toContain('Gamma rules.');
  });

  it('names the rulebook version directly below the ownership marker of a rulebook skill', async () => {
    await writeFixtureRulebook('gamma', "delivery: skill\nversion: '5'", 'Gamma rules.');
    await declareRulebooks('gamma');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(skillPath('consult-gamma'), 'utf8')).toContain(
      '<!-- codeassembly-rulebook:gamma -->\n<!-- rulebook-version: 5 -->',
    );
  });

  it('delivers a hook-bearing rulebook body without a directive, in both delivery modes', async () => {
    await writeFixtureRulebook(
      'gamma',
      'delivery: [ambient, skill]',
      '<!-- guidance-hook: implementation-preferences -->\n\nGamma rules.',
    );
    await declareRulebooks('gamma');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    const skill = await readFile(skillPath('consult-gamma'), 'utf8');
    expect(skill).not.toContain('guidance-hook');
    expect(skill).toContain('Gamma rules.');

    const localHost = await readFile(localHostPath(), 'utf8');
    expect(localHost).not.toContain('guidance-hook');
    expect(localHost).toContain('Gamma rules.');
  });

  it('fails a dry run with nothing written when a rulebook body contains a near-miss directive', async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill', '<!-- guidance-hooks: preferences -->');
    await declareRulebooks('gamma');

    await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
      /guidance\/rulebooks\/gamma\.md:1 .*reason=unrecognized-directive/,
    );
    expect(existsSync(skillPath('consult-gamma'))).toBe(false);
  });

  it('renders a skill-name override as the skill directory and name, keeping the marker on the slug', async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill\nskill-name: gamma-rulebook', 'Gamma rules.');
    await declareRulebooks('gamma');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(skillPath('consult-gamma'))).toBe(false);
    const skill = await readFile(skillPath('gamma-rulebook'), 'utf8');
    expect(skill).toContain('name: gamma-rulebook');
    expect(skill).toContain('<!-- codeassembly-rulebook:gamma -->');
  });

  it('writes a skill file for a multi-modal rulebook and also delivers it as ambient', async () => {
    await writeFixtureRulebook('delta', 'delivery: [ambient, skill]', 'Delta rules.');
    await declareRulebooks('delta');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(localHostPath(), 'utf8')).toContain('<!-- rulebook:delta -->');
    expect(await readFile(skillPath('consult-delta'), 'utf8')).toContain('Delta rules.');
  });

  it('when re-run with unchanged content, does not rewrite the skill file', async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');
    await syncCommand(makeOptions(), projectRoot, homeDir);
    const firstMtime = statSync(skillPath('consult-gamma')).mtimeMs;

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(statSync(skillPath('consult-gamma')).mtimeMs).toBe(firstMtime);
  });

  it('retracts the skill directory when a skill rulebook is no longer declared', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('alpha', 'gamma');
    await syncCommand(makeOptions(), projectRoot, homeDir);
    expect(existsSync(skillPath('consult-gamma'))).toBe(true);

    await declareRulebooks('alpha');
    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(path.dirname(skillPath('consult-gamma')))).toBe(false);
  });

  it('retracts the skill directory when a rulebook delivery changes away from skill', async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');
    await syncCommand(makeOptions(), projectRoot, homeDir);
    expect(existsSync(skillPath('consult-gamma'))).toBe(true);

    await writeFixtureRulebook('gamma', 'delivery: ambient', 'Gamma rules.');
    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(path.dirname(skillPath('consult-gamma')))).toBe(false);
    expect(await readFile(localHostPath(), 'utf8')).toContain('<!-- rulebook:gamma -->');
  });

  it('retracts the prior skill directory when a rulebook resolved skill name changes', async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');
    await syncCommand(makeOptions(), projectRoot, homeDir);
    expect(existsSync(skillPath('consult-gamma'))).toBe(true);

    await writeFixtureRulebook('gamma', 'delivery: skill\nskill-name: gamma-rulebook', 'Gamma rules.');
    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(path.dirname(skillPath('consult-gamma')))).toBe(false);
    expect(existsSync(skillPath('gamma-rulebook'))).toBe(true);
  });

  it('migrates a legacy slug-named skill directory to the consult- name', async () => {
    const legacy = skillPath('gamma');
    await mkdir(path.dirname(legacy), { recursive: true });
    await writeFile(
      legacy,
      '---\nname: gamma\nuser-invocable: true\n---\n<!-- codeassembly-rulebook:gamma -->\n\nGamma rules.\n',
      'utf8',
    );
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(path.dirname(skillPath('gamma')))).toBe(false);
    expect(existsSync(skillPath('consult-gamma'))).toBe(true);
  });

  it('never deletes a hand-authored skill that lacks the sync marker', async () => {
    const manualSkill = skillPath('manual');
    await mkdir(path.dirname(manualSkill), { recursive: true });
    await writeFile(manualSkill, '---\nname: manual\n---\n\n# Hand-authored\n', 'utf8');
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(manualSkill)).toBe(true);
    expect(existsSync(skillPath('consult-gamma'))).toBe(true);
  });

  it('deploys a rulebook declared only in the project-local tier, and retracts it on drop', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await writeFixtureRulebook('beta', 'delivery: ambient', 'Beta rules.');
    await declareRulebooks('alpha');
    await writeLocalDeclaration('rulebooks:\n  use:\n    - beta\n');
    await syncCommand(makeOptions(), projectRoot, homeDir);

    const both = await readFile(localHostPath(), 'utf8');
    expect(both).toContain('<!-- rulebook:alpha -->');
    expect(both).toContain('<!-- rulebook:beta -->');

    await writeLocalDeclaration('rulebooks:\n  use:\n    - beta\n  drop:\n    - alpha\n');
    await syncCommand(makeOptions(), projectRoot, homeDir);

    const dropped = await readFile(localHostPath(), 'utf8');
    expect(dropped).not.toContain('<!-- rulebook:alpha -->');
    expect(dropped).toContain('<!-- rulebook:beta -->');
  });

  it('fails when two skill rulebooks resolve to the same skill name, naming both slugs', async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill\nskill-name: shared', 'Gamma rules.');
    await writeFixtureRulebook('delta', 'delivery: skill\nskill-name: shared', 'Delta rules.');
    await declareRulebooks('gamma', 'delta');

    let message = '';
    try {
      await syncCommand(makeOptions(), projectRoot, homeDir);
    } catch (error: unknown) {
      message = describeError(error);
    }

    expect(message).toContain('shared');
    expect(message).toContain('gamma');
    expect(message).toContain('delta');
    expect(existsSync(skillPath('shared'))).toBe(false);
  });

  it('reassigns a skill name from one rulebook to another within a single sync', async () => {
    await writeFixtureRulebook('foo', 'delivery: skill\nskill-name: shared', 'Foo rules.');
    await declareRulebooks('foo');
    await syncCommand(makeOptions(), projectRoot, homeDir);
    expect(existsSync(skillPath('shared'))).toBe(true);

    await writeFixtureRulebook('foo', 'delivery: skill', 'Foo rules.');
    await writeFixtureRulebook('bar', 'delivery: skill\nskill-name: shared', 'Bar rules.');
    await declareRulebooks('foo', 'bar');
    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(skillPath('consult-foo'), 'utf8')).toContain('<!-- codeassembly-rulebook:foo -->');
    const shared = await readFile(skillPath('shared'), 'utf8');
    expect(shared).toContain('name: shared');
    expect(shared).toContain('<!-- codeassembly-rulebook:bar -->');
  });

  describe('rulebook invocation tokens', () => {
    it('renders a rulebook token to each harness sigil in both delivery passes', async () => {
      await writeFixtureRulebook('nmr-scripts', 'delivery: skill', 'Script rules.');
      await writeFixtureRulebook('nmr-cheatsheet', 'delivery: [ambient, skill]', 'See {rulebook:nmr-scripts}.');
      await declareRulebooks('nmr-cheatsheet', 'nmr-scripts');
      await installBothHarnesses();

      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

      expect(await readFile(localHostPath('CLAUDE.local.md'), 'utf8')).toContain('See /consult-nmr-scripts.');
      expect(await readFile(localHostPath('AGENTS.local.md'), 'utf8')).toContain('See !consult-nmr-scripts.');
      expect(await readFile(skillPath('consult-nmr-cheatsheet'), 'utf8')).toContain('See /consult-nmr-scripts.');
      expect(await readFile(skillPath('consult-nmr-cheatsheet', ROVO_HOME), 'utf8')).toContain(
        'See !consult-nmr-scripts.',
      );
    });

    it('deploys a rulebook named only by a body token', async () => {
      await writeFixtureRulebook('nmr-scripts', 'delivery: skill', 'Script rules.');
      await writeFixtureRulebook('nmr-cheatsheet', 'delivery: ambient', 'See {rulebook:nmr-scripts}.');
      await declareRulebooks('nmr-cheatsheet');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(await readFile(skillPath('consult-nmr-scripts'), 'utf8')).toContain('Script rules.');
    });

    it('renders a token through the skill-name override on its target', async () => {
      await writeFixtureRulebook('shell-conventions', 'delivery: skill\nskill-name: shell-rules', 'Shell rules.');
      await writeFixtureRulebook('hub', 'delivery: ambient', 'See {rulebook:shell-conventions}.');
      await declareRulebooks('hub');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(await readFile(localHostPath(), 'utf8')).toContain('See /shell-rules.');
    });

    it('fails a dry run with nothing written when a token names an ambient-only rulebook', async () => {
      await writeFixtureRulebook('nmr-cheatsheet', 'delivery: ambient', 'Cheatsheet rules.');
      await writeFixtureRulebook('hub', 'delivery: ambient', 'See {rulebook:nmr-cheatsheet}.');
      await declareRulebooks('hub');

      await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
        /\{rulebook:nmr-cheatsheet\}[\s\S]*ambient-only/,
      );
      expect(existsSync(localHostPath())).toBe(false);
    });
  });

  describe('unresolvable declared artifacts', () => {
    it("names the project declaration and writes nothing when a declared rulebook doesn't resolve from any source", async () => {
      await declareRulebooks('ghost');

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(
        `The project declaration (${declarationPath()}) declares rulebook "ghost", which was not found in any of:`,
      );
      expect(existsSync(path.join(projectRoot, '.claude'))).toBe(false);
      expect(existsSync(path.join(projectRoot, '.agents', 'rulebooks'))).toBe(false);
    });

    it('names the local declaration when only it declares the missing slug', async () => {
      await declareRulebooks();
      await writeLocalDeclaration('rulebooks:\n  use:\n    - ghost\n');

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(
        `The project declaration (${localDeclarationPath()}) declares rulebook "ghost"`,
      );
    });

    it('names both tiers when both declare the missing slug', async () => {
      await declareRulebooks('ghost');
      await writeLocalDeclaration('rulebooks:\n  use:\n    - ghost\n');

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(
        `The project declaration (${declarationPath()}, ${localDeclarationPath()}) declares rulebook "ghost"`,
      );
    });

    it('names a declared skill, subagent, and collection the same way', async () => {
      for (const [key, type] of [
        ['skills', 'skill'],
        ['subagents', 'subagent'],
        ['collections', 'collection'],
      ]) {
        await declareFixtureSource(projectRoot, contentDir, `${key}:\n  use:\n    - ghost\n`);

        await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(
          `The project declaration (${declarationPath()}) declares ${type} "ghost"`,
        );
      }
    });

    it('reports the locations searched alongside the declaring file', async () => {
      await declareRulebooks('ghost');

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(contentDir);
    });

    it('refuses a dry run wherever a real run would', async () => {
      await declareRulebooks('ghost');

      await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
        `declares rulebook "ghost"`,
      );
    });
  });

  describe('declared references', () => {
    const REFERENCE_DECLARATION =
      'references:\n  - name: fixture-docs\n    package: ca-fixture-docs\n    path: dist/docs\n    summary: |\n' +
      '      Read the guide for the installed version.\n      It differs from training data.\n';

    /** Installs a fixture package under the project's `node_modules` with a `dist/docs` directory. */
    async function installDocsPackage(): Promise<string> {
      const packageDir = path.join(projectRoot, 'node_modules', 'ca-fixture-docs');
      await mkdir(path.join(packageDir, 'dist', 'docs'), { recursive: true });
      await writeFile(path.join(packageDir, 'package.json'), '{ "name": "ca-fixture-docs" }', 'utf8');
      return packageDir;
    }

    /** Writes the project-scope codeassembly.yaml declaring the fixture source plus the given verbatim body. */
    async function declareRaw(content: string): Promise<void> {
      await declareFixtureSource(projectRoot, contentDir, content);
    }

    it('writes a reference block into each targeted harness host when no rulebook is ambient', async () => {
      const packageDir = await installDocsPackage();
      await declareRaw(REFERENCE_DECLARATION);
      await installBothHarnesses();

      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

      for (const name of ['CLAUDE.local.md', 'AGENTS.local.md']) {
        expect(await readFile(localHostPath(name), 'utf8')).toContain(
          [
            '<!-- reference:fixture-docs -->',
            'Read the guide for the installed version.',
            'It differs from training data.',
            '',
            `Location: \`${path.join(packageDir, 'dist', 'docs')}\``,
            '<!-- /reference:fixture-docs -->',
          ].join('\n'),
        );
      }
    });

    it('places reference blocks after the rulebook blocks, and a re-run changes nothing', async () => {
      await installDocsPackage();
      await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
      await declareRaw(`rulebooks:\n  use:\n    - alpha\n${REFERENCE_DECLARATION}`);

      await syncCommand(makeOptions(), projectRoot, homeDir);
      const first = await readFile(localHostPath(), 'utf8');
      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(first.indexOf('<!-- rulebook:alpha -->')).toBeLessThan(first.indexOf('<!-- reference:fixture-docs -->'));
      expect(await readFile(localHostPath(), 'utf8')).toBe(first);
    });

    it('names the resolved path in the dry-run report without writing', async () => {
      const packageDir = await installDocsPackage();
      await declareRaw(REFERENCE_DECLARATION);

      const outcome = await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir);

      expect(renderReportText(outcome, { dryRun: true })).toContain(
        `point reference "fixture-docs" at ${path.join(packageDir, 'dist', 'docs')}`,
      );
      expect(existsSync(localHostPath())).toBe(false);
    });

    it.each([false, true])(
      'fails on a reference that does not resolve before any write (dry run: %s), keeping the written region',
      async (dryRun) => {
        const packageDir = await installDocsPackage();
        await declareRaw(REFERENCE_DECLARATION);
        await syncCommand(makeOptions(), projectRoot, homeDir);
        const written = await readFile(localHostPath(), 'utf8');
        await rm(path.join(packageDir, 'dist'), { recursive: true });

        let raised: unknown;
        try {
          await syncCommand(makeOptions({ dryRun }), projectRoot, homeDir);
        } catch (error: unknown) {
          raised = error;
        }

        expect(isSyncValidationError(raised) && raised.defects).toEqual([
          {
            file: declarationPath(),
            kind: 'resolution',
            detail: expect.stringContaining('Reference "fixture-docs": path "dist/docs" does not exist'),
          },
        ]);
        expect(await readFile(localHostPath(), 'utf8')).toBe(written);
      },
    );

    it('refuses a local host with a damaged ambient region when only references are declared', async () => {
      await installDocsPackage();
      await declareRaw(REFERENCE_DECLARATION);
      const broken = '# Personal notes\n\n<!-- codeassembly-ambient:start -->\nStranded text.\n';
      await writeFile(localHostPath(), broken, 'utf8');

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(/damaged ambient region/);

      expect(await readFile(localHostPath(), 'utf8')).toBe(broken);
    });
  });

  describe('rulebook body rendering', () => {
    /** The absolute project path at which a harness receives a fixture-source support file. */
    const supportPath = (dotDir: string, relPath: string): string =>
      path.join(path.resolve(projectRoot), dotDir, 'skills', '_sources', FIXTURE_SOURCE_NAME, relPath);

    it("rewrites a relative support link into its source's project namespace in skill delivery", async () => {
      await writeFixtureSupportFile('_data/concision.md');
      await writeFixtureRulebook('alpha', 'delivery: skill', 'See [concision](../../skills/_data/concision.md).');
      await declareRulebooks('alpha');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(await readFile(skillPath('consult-alpha'), 'utf8')).toContain(
        `See [concision](${supportPath('.claude', '_data/concision.md')}).`,
      );
    });

    it('preserves an anchor fragment on a rewritten target', async () => {
      await writeFixtureSupportFile('_data/action-items.md');
      await writeFixtureRulebook('alpha', 'delivery: skill', 'See [block](../../skills/_data/action-items.md#block).');
      await declareRulebooks('alpha');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(await readFile(skillPath('consult-alpha'), 'utf8')).toContain(
        `(${supportPath('.claude', '_data/action-items.md')}#block)`,
      );
    });

    it('anchors a link to a delivered skill in the project, where the same run writes it', async () => {
      await writeFixtureRulebook('alpha', 'delivery: skill', 'See [beta](../../skills/consult-beta/SKILL.md).');
      await writeFixtureRulebook('beta', 'delivery: skill', 'Beta body.');
      await declareRulebooks('alpha', 'beta');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(await readFile(skillPath('consult-alpha'), 'utf8')).toContain(
        `[beta](${path.resolve(projectRoot)}/.claude/skills/consult-beta/SKILL.md)`,
      );
    });

    it('expands harness template variables in the delivered body', async () => {
      await writeFixtureRulebook('alpha', 'delivery: skill', 'Run {harness_home_dir}/scripts/x.sh as {harness_id}.');
      await declareRulebooks('alpha');

      await syncCommand(makeOptions(), projectRoot, homeDir);

      expect(await readFile(skillPath('consult-alpha'), 'utf8')).toContain('Run ~/.claude/scripts/x.sh as claude.');
    });

    it('gives each harness its own absolute path, in both skill and ambient delivery', async () => {
      await writeFixtureSupportFile('_data/concision.md');
      await installBothHarnesses();
      await writeFixtureRulebook(
        'alpha',
        'delivery: [ambient, skill]',
        'See [concision](../../skills/_data/concision.md).',
      );
      await declareRulebooks('alpha');

      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

      const claudeTarget = supportPath('.claude', '_data/concision.md');
      const rovoTarget = supportPath(ROVO_HOME, '_data/concision.md');
      expect(await readFile(skillPath('consult-alpha', '.claude'), 'utf8')).toContain(claudeTarget);
      expect(await readFile(skillPath('consult-alpha', ROVO_HOME), 'utf8')).toContain(rovoTarget);
      expect(await readFile(localHostPath('CLAUDE.local.md'), 'utf8')).toContain(claudeTarget);
      expect(await readFile(localHostPath('AGENTS.local.md'), 'utf8')).toContain(rovoTarget);
    });

    it('fails the run when a link target is not under a linkable root, naming the rulebook and the target', async () => {
      await writeFixtureRulebook('alpha', 'delivery: skill', 'See [canary](../../subagents/canary.md).');
      await declareRulebooks('alpha');

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(
        /alpha[\s\S]*subagents\/canary\.md/,
      );
    });

    it('fails the run when a link target escapes the content root', async () => {
      await writeFixtureRulebook('alpha', 'delivery: ambient', 'See [x](../../../elsewhere/a.md).');
      await declareRulebooks('alpha');

      await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(/escapes the content root/);
    });

    it('fails a dry run on a bad link target, writing nothing', async () => {
      await writeFixtureRulebook('alpha', 'delivery: [ambient, skill]', 'See [canary](../../subagents/canary.md).');
      await declareRulebooks('alpha');

      await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
        /unusable Markdown link target/,
      );
      expect(existsSync(skillPath('consult-alpha'))).toBe(false);
      expect(existsSync(localHostPath())).toBe(false);
    });

    it("fails a dry run on an anchor that doesn't name any heading in the rulebook body, writing nothing", async () => {
      await writeFixtureRulebook('alpha', 'delivery: [ambient, skill]', 'See [the events](#lifecycle-events).');
      await declareRulebooks('alpha');

      await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
        /guidance\/rulebooks\/alpha\.md contains 1 unresolvable anchor link target/,
      );
      expect(existsSync(skillPath('consult-alpha'))).toBe(false);
      expect(existsSync(localHostPath())).toBe(false);
    });
  });
});
