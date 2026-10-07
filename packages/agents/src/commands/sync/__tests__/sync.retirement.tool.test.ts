import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { syncCommand } from '../sync.ts';
import { createSyncFixture } from '../test-utils/create-sync-fixture.ts';
import { renderReportText } from '../test-utils/render-report-text.ts';

describe(syncCommand, () => {
  const fixture = createSyncFixture();
  const { makeOptions, writeFixtureRulebook, declareRulebooks, projectMdPath, agentsMdPath, localHostPath, skillPath } =
    fixture;
  let projectRoot: string;
  let homeDir: string;

  beforeEach(() => {
    ({ projectRoot, homeDir } = fixture);
  });
  it('retracts a rulebook that is no longer declared', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await writeFixtureRulebook('beta', 'delivery: ambient', 'Beta rules.');
    await declareRulebooks('alpha', 'beta');
    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(localHostPath(), 'utf8')).toContain('<!-- rulebook:beta -->');

    await declareRulebooks('alpha');
    await syncCommand(makeOptions(), projectRoot, homeDir);

    const localHost = await readFile(localHostPath(), 'utf8');
    expect(localHost).not.toContain('<!-- rulebook:beta -->');
    expect(localHost).toContain('<!-- rulebook:alpha -->');
  });

  it('retracts the delivered block when a rulebook delivery changes away from ambient', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');
    await syncCommand(makeOptions(), projectRoot, homeDir);
    expect(await readFile(localHostPath(), 'utf8')).toContain('<!-- rulebook:alpha -->');

    await writeFixtureRulebook('alpha', 'delivery: skill', 'Alpha rules.');
    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(skillPath('consult-alpha'))).toBe(true);
    expect(await readFile(localHostPath(), 'utf8')).not.toContain('<!-- rulebook:alpha -->');
  });

  it('when the manifest is emptied, retracts every delivered block', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');
    await syncCommand(makeOptions(), projectRoot, homeDir);
    expect(await readFile(localHostPath(), 'utf8')).toContain('<!-- rulebook:alpha -->');

    await declareRulebooks();
    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(localHostPath(), 'utf8')).not.toContain('<!-- rulebook:alpha -->');
  });

  it('strips retired rulebook blocks from PROJECT.md, keeping hand-authored content and the file', async () => {
    await writeFixtureRulebook('alpha', 'delivery: skill', 'Alpha rules.');
    await declareRulebooks('alpha');
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await writeFile(
      projectMdPath(),
      '# Project\n\n@nmr/AGENTS.md\n\n<!-- rulebook:alpha -->\nAlpha rules.\n<!-- /rulebook:alpha -->\n\nTail prose.\n',
      'utf8',
    );

    await syncCommand(makeOptions(), projectRoot, homeDir);

    const projectMd = await readFile(projectMdPath(), 'utf8');
    expect(projectMd).not.toContain('<!-- rulebook:alpha -->');
    expect(projectMd).toContain('@nmr/AGENTS.md');
    expect(projectMd).toContain('Tail prose.');
  });

  it('never deletes PROJECT.md, even once nothing but the retired blocks remains', async () => {
    await writeFixtureRulebook('alpha', 'delivery: skill', 'Alpha rules.');
    await declareRulebooks('alpha');
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await writeFile(projectMdPath(), '<!-- rulebook:alpha -->\nAlpha rules.\n<!-- /rulebook:alpha -->\n', 'utf8');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(projectMdPath())).toBe(true);
    expect(await readFile(projectMdPath(), 'utf8')).not.toContain('<!-- rulebook:alpha -->');
  });

  it('retires a pre-existing .agents/rulebooks/ tree and writes none of its own', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');
    const neutralDir = path.join(projectRoot, '.agents', 'rulebooks');
    await mkdir(neutralDir, { recursive: true });
    await writeFile(path.join(neutralDir, 'alpha.md'), '# Alpha\n', 'utf8');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(neutralDir)).toBe(false);
  });

  it('leaves PROJECT.md and the neutral tree untouched when neither is present', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');

    await syncCommand(makeOptions(), projectRoot, homeDir);
    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(projectMdPath())).toBe(false);
    expect(existsSync(path.join(projectRoot, '.agents', 'rulebooks'))).toBe(false);
  });

  it('strips retired rulebook blocks from AGENTS.md, keeping hand-authored content and the file', async () => {
    await writeFixtureRulebook('alpha', 'delivery: skill', 'Alpha rules.');
    await declareRulebooks('alpha');
    await writeFile(
      agentsMdPath(),
      '# Project\n\n@.path/to/example-file.md\n\n<!-- rulebook:alpha -->\nAlpha rules.\n<!-- /rulebook:alpha -->\n\nTail prose.\n',
      'utf8',
    );

    await syncCommand(makeOptions(), projectRoot, homeDir);

    const agentsMd = await readFile(agentsMdPath(), 'utf8');
    expect(agentsMd).not.toContain('<!-- rulebook:alpha -->');
    expect(agentsMd).toContain('@.path/to/example-file.md');
    expect(agentsMd).toContain('Tail prose.');
  });

  it('never deletes AGENTS.md, even once nothing but the retired blocks remains', async () => {
    await writeFixtureRulebook('alpha', 'delivery: skill', 'Alpha rules.');
    await declareRulebooks('alpha');
    await writeFile(agentsMdPath(), '<!-- rulebook:alpha -->\nAlpha rules.\n<!-- /rulebook:alpha -->\n', 'utf8');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(agentsMdPath())).toBe(true);
    expect(await readFile(agentsMdPath(), 'utf8')).not.toContain('<!-- rulebook:alpha -->');
  });

  it('leaves AGENTS.md untouched when it is not present', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(agentsMdPath())).toBe(false);
  });

  it('previews both retirements in dry-run without performing them', async () => {
    await writeFixtureRulebook('alpha', 'delivery: skill', 'Alpha rules.');
    await declareRulebooks('alpha');
    await mkdir(path.join(projectRoot, '.agents', 'rulebooks'), { recursive: true });
    const projectMd = '<!-- rulebook:alpha -->\nAlpha rules.\n<!-- /rulebook:alpha -->\n';
    await writeFile(projectMdPath(), projectMd, 'utf8');
    await writeFile(path.join(projectRoot, '.agents', 'rulebooks', 'alpha.md'), '# Alpha\n', 'utf8');

    const output = renderReportText(await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir), {
      dryRun: true,
      level: 'info',
    });

    expect(output).toContain(`retire the rulebook blocks in ${projectMdPath()}`);
    expect(output).toContain('retire the neutral rulebook tree');
    expect(await readFile(projectMdPath(), 'utf8')).toBe(projectMd);
    expect(existsSync(path.join(projectRoot, '.agents', 'rulebooks', 'alpha.md'))).toBe(true);
  });

  it('reports the retirement performed by a live run, not only the one predicted by a dry run', async () => {
    await writeFixtureRulebook('alpha', 'delivery: skill', 'Alpha rules.');
    await declareRulebooks('alpha');
    await writeFile(projectMdPath(), '<!-- rulebook:alpha -->\nAlpha rules.\n<!-- /rulebook:alpha -->\n', 'utf8');

    const output = renderReportText(await syncCommand(makeOptions(), projectRoot, homeDir), {
      level: 'info',
    });

    expect(output).toContain(`Retired the rulebook blocks in ${projectMdPath()}`);
  });
});
