import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { hasAmbientRegion } from '../../../lib/ambient-region.ts';
import { HARNESSES } from '../../../lib/harness.ts';
import { syncCommand } from '../sync.ts';
import { createSyncFixture } from '../test-utils/create-sync-fixture.ts';
import { renderReportText } from '../test-utils/render-report-text.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

describe(syncCommand, () => {
  const fixture = createSyncFixture();
  const {
    makeOptions,
    installBothHarnesses,
    writeFixtureRulebook,
    declareRulebooks,
    writeLocalDeclaration,
    localHostPath,
    skillPath,
  } = fixture;
  let projectRoot: string;
  let homeDir: string;

  beforeEach(() => {
    ({ projectRoot, homeDir } = fixture);
  });
  it('with --harness claude, writes only the Claude skills dir', async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');

    await syncCommand(makeOptions({ harness: 'claude' }), projectRoot, homeDir);

    expect(existsSync(skillPath('consult-gamma', '.claude'))).toBe(true);
    expect(existsSync(skillPath('consult-gamma', ROVO_HOME))).toBe(false);
  });

  it("when this user doesn't have any harness installed, doesn't write a skill file or a local host", async () => {
    await writeFixtureRulebook('gamma', 'delivery: [ambient, skill]', 'Gamma rules.');
    await declareRulebooks('gamma');

    await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

    expect(existsSync(skillPath('consult-gamma'))).toBe(false);
    expect(existsSync(localHostPath())).toBe(false);
  });

  it("delivers to an installed harness for which the repository doesn't contain a directory", async () => {
    await writeFixtureRulebook('gamma', 'delivery: [ambient, skill]', 'Gamma rules.');
    await declareRulebooks('gamma');
    await installBothHarnesses();

    await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

    expect(existsSync(skillPath('consult-gamma', '.claude'))).toBe(true);
    expect(existsSync(skillPath('consult-gamma', ROVO_HOME))).toBe(true);
  });

  it('targets the declared harnesses in preference to those installed for this user', async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');
    await writeLocalDeclaration('harnesses:\n  use:\n    - rovo\n');
    await installBothHarnesses();

    await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

    expect(existsSync(skillPath('consult-gamma', ROVO_HOME))).toBe(true);
    expect(existsSync(skillPath('consult-gamma', '.claude'))).toBe(false);
  });

  it('names the detected harnesses and the detection that decided it', async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');
    await installBothHarnesses();
    const output = renderReportText(await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir), {
      level: 'info',
    });

    expect(output).toContain('Targeting claude, rovo (detected in ~).');
  });

  it('names a declared harness set and the declaration that decided it', async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');
    await writeLocalDeclaration('harnesses:\n  use:\n    - claude\n');
    await installBothHarnesses();
    const output = renderReportText(await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir), {
      level: 'info',
    });

    expect(output).toContain('Targeting claude (declared).');
  });

  it("says so when a declaration doesn't leave any harness targeted", async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');
    await writeLocalDeclaration('harnesses:\n  drop:\n    - claude\n    - rovo\n');
    await installBothHarnesses();
    const output = renderReportText(await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir), {
      level: 'info',
    });

    expect(output).toContain('Targeting no harnesses (declared).');
    expect(existsSync(skillPath('consult-gamma', '.claude'))).toBe(false);
  });

  it('retracts the harness dropped by a narrowed declaration', async () => {
    await writeFixtureRulebook('gamma', 'delivery: [ambient, skill]', 'Gamma rules.');
    await declareRulebooks('gamma');
    await writeLocalDeclaration('harnesses:\n  use:\n    - claude\n    - rovo\n');
    await installBothHarnesses();
    await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);
    expect(existsSync(skillPath('consult-gamma', ROVO_HOME))).toBe(true);

    await writeLocalDeclaration('harnesses:\n  use:\n    - claude\n');
    await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

    expect(existsSync(skillPath('consult-gamma', ROVO_HOME))).toBe(false);
    expect(existsSync(path.join(projectRoot, HARNESSES.rovo.localGuidanceFileName))).toBe(false);
    expect(existsSync(skillPath('consult-gamma', '.claude'))).toBe(true);
    expect(hasAmbientRegion(await readFile(path.join(projectRoot, 'CLAUDE.local.md'), 'utf8'))).toBe(true);
  });

  it('names what it would retract under --dry-run, leaving the dropped harness in place', async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');
    await writeLocalDeclaration('harnesses:\n  use:\n    - claude\n    - rovo\n');
    await installBothHarnesses();
    await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

    await writeLocalDeclaration('harnesses:\n  use:\n    - claude\n');
    const output = renderReportText(
      await syncCommand(makeOptions({ harness: 'all', dryRun: true }), projectRoot, homeDir),
      { dryRun: true, level: 'info' },
    );

    expect(output).toContain('retract harness dropped from the declaration: rovo');
    expect(output).toContain(`remove skill ${path.join(projectRoot, ROVO_HOME, 'skills', 'consult-gamma')}`);
    expect(existsSync(skillPath('consult-gamma', ROVO_HOME))).toBe(true);
  });

  it('retracts nothing from a harness --harness merely excludes', async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');
    await writeLocalDeclaration('harnesses:\n  use:\n    - claude\n    - rovo\n');
    await installBothHarnesses();
    await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

    await syncCommand(makeOptions({ harness: 'claude' }), projectRoot, homeDir);

    expect(existsSync(skillPath('consult-gamma', ROVO_HOME))).toBe(true);
  });

  it('names its targeting under --dry-run as well', async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');
    await installBothHarnesses();
    const output = renderReportText(
      await syncCommand(makeOptions({ harness: 'all', dryRun: true }), projectRoot, homeDir),
      { dryRun: true, level: 'info' },
    );

    expect(output).toContain('Targeting claude, rovo (detected in ~).');
  });

  describe('a rulebook that declares supported-harnesses', () => {
    it('deploys its ambient block and its skill only to the harnesses that it names', async () => {
      await writeFixtureRulebook(
        'claude-models',
        'delivery: [ambient, skill]\nsupported-harnesses: claude',
        'Use the latest model.',
      );
      await declareRulebooks('claude-models');
      await installBothHarnesses();

      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

      expect(existsSync(skillPath('consult-claude-models', '.claude'))).toBe(true);
      expect(existsSync(skillPath('consult-claude-models', ROVO_HOME))).toBe(false);
      expect(await readFile(localHostPath(), 'utf8')).toContain('Use the latest model.');
      expect(existsSync(localHostPath('AGENTS.local.md'))).toBe(false);
    });

    it('retracts its skill and its ambient block from a harness that it newly excludes', async () => {
      await writeFixtureRulebook('claude-models', 'delivery: [ambient, skill]', 'Use the latest model.');
      await writeFixtureRulebook('shared', 'delivery: ambient', 'Shared rules.');
      await declareRulebooks('claude-models', 'shared');
      await installBothHarnesses();
      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);
      expect(existsSync(skillPath('consult-claude-models', ROVO_HOME))).toBe(true);

      await writeFixtureRulebook(
        'claude-models',
        'delivery: [ambient, skill]\nsupported-harnesses: claude',
        'Use the latest model.',
      );
      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

      expect(existsSync(skillPath('consult-claude-models', '.claude'))).toBe(true);
      expect(existsSync(skillPath('consult-claude-models', ROVO_HOME))).toBe(false);
      const rovoHost = await readFile(localHostPath('AGENTS.local.md'), 'utf8');
      expect(rovoHost).toContain('Shared rules.');
      expect(rovoHost).not.toContain('Use the latest model.');
    });

    it('reports under --dry-run only the skill writes that the run makes', async () => {
      await writeFixtureRulebook(
        'claude-models',
        'delivery: skill\nsupported-harnesses: claude',
        'Use the latest model.',
      );
      await declareRulebooks('claude-models');
      await installBothHarnesses();

      const output = renderReportText(
        await syncCommand(makeOptions({ harness: 'all', dryRun: true }), projectRoot, homeDir),
        { dryRun: true, level: 'info' },
      );

      expect(output).toContain(`write ${skillPath('consult-claude-models', '.claude')}`);
      expect(output).not.toContain(skillPath('consult-claude-models', ROVO_HOME));
    });

    it('counts in the closing summary only the skill files that the run writes', async () => {
      await writeFixtureRulebook(
        'claude-models',
        'delivery: skill\nsupported-harnesses: claude',
        'Use the latest model.',
      );
      await declareRulebooks('claude-models');
      await installBothHarnesses();

      const output = renderReportText(await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir), {
        level: 'info',
      });

      expect(output).toContain('delivered 1 rulebook-skill file(s)');
    });

    it('fails the run when a body deployed to an excluded harness names it by token', async () => {
      await writeFixtureRulebook(
        'claude-models',
        'delivery: skill\nsupported-harnesses: claude',
        'Use the latest model.',
      );
      await writeFixtureRulebook('dispatch', 'delivery: skill', 'See {rulebook:claude-models}.');
      await declareRulebooks('claude-models', 'dispatch');
      await installBothHarnesses();

      await expect(syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir)).rejects.toThrow(
        /names a rulebook that deploys only to claude/,
      );
    });

    it('renders a token naming it in a body that deploys only where it does', async () => {
      await writeFixtureRulebook(
        'claude-models',
        'delivery: skill\nsupported-harnesses: claude',
        'Use the latest model.',
      );
      await writeFixtureRulebook(
        'dispatch',
        'delivery: skill\nsupported-harnesses: claude',
        'See {rulebook:claude-models}.',
      );
      await declareRulebooks('claude-models', 'dispatch');
      await installBothHarnesses();

      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

      expect(await readFile(skillPath('consult-dispatch', '.claude'), 'utf8')).toContain('See /consult-claude-models.');
    });
  });
});
