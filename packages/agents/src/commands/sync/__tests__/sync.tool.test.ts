import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { beforeEach, describe, expect, it } from 'vitest';

import { syncCommand } from '../sync.ts';
import { ambientRegionNote } from '../test-utils/ambient-region-note.ts';
import { createSyncFixture } from '../test-utils/create-sync-fixture.ts';
import { renderReportLines } from '../test-utils/render-report-lines.ts';
import { renderReportText } from '../test-utils/render-report-text.ts';

const execFileAsync = promisify(execFile);

describe(syncCommand, () => {
  const fixture = createSyncFixture();
  const {
    makeOptions,
    installBothHarnesses,
    writeFixtureRulebook,
    declareRulebooks,
    writeLocalDeclaration,
    projectMdPath,
    localHostPath,
    skillPath,
  } = fixture;
  let projectRoot: string;
  let homeDir: string;

  beforeEach(() => {
    ({ projectRoot, homeDir } = fixture);
  });
  it("when codeassembly.yaml doesn't exist, doesn't make any changes", async () => {
    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(path.join(projectRoot, '.agents', 'rulebooks'))).toBe(false);
    expect(existsSync(projectMdPath())).toBe(false);
  });

  it('delivers the rulebook body with its frontmatter stripped', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', '# Alpha\n\nAlpha rules.');
    await declareRulebooks('alpha');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    const localHost = await readFile(localHostPath(), 'utf8');
    expect(localHost).toContain('# Alpha\n\nAlpha rules.\n');
    expect(localHost).not.toContain('slug:');
  });

  it('names the rulebook version directly below the open marker', async () => {
    await writeFixtureRulebook('alpha', "delivery: ambient\nversion: '3'", 'Alpha rules.');
    await declareRulebooks('alpha');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(localHostPath(), 'utf8')).toContain('<!-- rulebook:alpha -->\n<!-- rulebook-version: 3 -->');
  });

  it("doesn't name a version for a rulebook that doesn't declare one", async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(localHostPath(), 'utf8')).not.toContain('rulebook-version');
  });

  it('creates the local host containing the ambient region when one is absent', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', '# Alpha\n\nAlpha rules.');
    await declareRulebooks('alpha');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    const localHost = await readFile(localHostPath(), 'utf8');
    expect(localHost).toContain('<!-- codeassembly-ambient:start -->');
    expect(localHost).toContain('<!-- rulebook:alpha -->');
    expect(localHost).toContain('<!-- /rulebook:alpha -->');
    expect(localHost).toContain('Alpha rules.');
    expect(existsSync(projectMdPath())).toBe(false);
  });

  it('opens the region with the generated note, directly above the first rulebook block', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(localHostPath(), 'utf8')).toContain(
      `<!-- codeassembly-ambient:start -->\n${ambientRegionNote}\n<!-- rulebook:alpha -->`,
    );
  });

  it('appends the region to a hand-authored local host, leaving its other content byte-identical', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');
    const handAuthored = '# Personal notes\n\nMy sandbox URL is http://localhost:9999.\n';
    await writeFile(localHostPath(), handAuthored, 'utf8');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    const localHost = await readFile(localHostPath(), 'utf8');
    expect(localHost.startsWith(handAuthored)).toBe(true);
    expect(localHost).toContain('<!-- rulebook:alpha -->');
  });

  it("delivers into each targeted harness's own local host", async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');
    await installBothHarnesses();

    await syncCommand(makeOptions({ harness: 'all' }), projectRoot, homeDir);

    for (const name of ['CLAUDE.local.md', 'AGENTS.local.md']) {
      expect(await readFile(localHostPath(name), 'utf8')).toContain('<!-- rulebook:alpha -->');
    }
  });

  it("when re-run with the same manifest, doesn't change any file", async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', '# Alpha\n\nAlpha rules.');
    await declareRulebooks('alpha');

    await syncCommand(makeOptions(), projectRoot, homeDir);
    const firstLocalHost = await readFile(localHostPath(), 'utf8');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(await readFile(localHostPath(), 'utf8')).toBe(firstLocalHost);
  });

  it("doesn't create a local host when the scope doesn't declare any ambient rulebook", async () => {
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');

    await syncCommand(makeOptions(), projectRoot, homeDir);

    expect(existsSync(localHostPath())).toBe(false);
  });

  it('empties the region of an existing local host once nothing is ambient, keeping the file', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');
    await writeFile(localHostPath(), '# Personal notes\n', 'utf8');
    await syncCommand(makeOptions(), projectRoot, homeDir);
    expect(await readFile(localHostPath(), 'utf8')).toContain('<!-- rulebook:alpha -->');

    await declareRulebooks();
    await syncCommand(makeOptions(), projectRoot, homeDir);

    const localHost = await readFile(localHostPath(), 'utf8');
    expect(localHost).not.toContain('<!-- rulebook:alpha -->');
    expect(localHost).not.toContain(ambientRegionNote);
    expect(localHost).toContain('# Personal notes');
    expect(localHost).toContain('<!-- codeassembly-ambient:start -->');
  });

  it('refuses a project declaration that sets the home-domain writer key', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');
    await writeLocalDeclaration(`home-writer: ${homeDir}\n`);

    await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(/home-writer/);

    expect(existsSync(localHostPath())).toBe(false);
  });

  it('refuses to write a local host containing an unmatched ambient marker, changing nothing', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');
    const broken = '# Personal notes\n\n<!-- codeassembly-ambient:start -->\nStranded text.\n';
    await writeFile(localHostPath(), broken, 'utf8');

    await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(/damaged ambient region/);

    expect(await readFile(localHostPath(), 'utf8')).toBe(broken);
    expect(existsSync(skillPath('consult-alpha'))).toBe(false);
  });

  it('refuses a local host containing an unmatched ambient marker in dry-run too', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');
    await writeFile(localHostPath(), '<!-- codeassembly-ambient:start -->\nStranded text.\n', 'utf8');

    await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir)).rejects.toThrow(
      /damaged ambient region/,
    );
  });

  it('refuses a local host with a stray marker above the managed region, keeping the text between them', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');
    await writeFile(localHostPath(), '# Personal notes\n', 'utf8');
    await syncCommand(makeOptions(), projectRoot, homeDir);
    const stray = (await readFile(localHostPath(), 'utf8')).replace(
      '# Personal notes\n',
      '# Personal notes\n\n<!-- codeassembly-ambient:start -->\nMy sandbox URL.\n',
    );
    await writeFile(localHostPath(), stray, 'utf8');

    await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(/damaged ambient region/);

    expect(await readFile(localHostPath(), 'utf8')).toBe(stray);
  });

  it('refuses a local host containing two ambient regions rather than leaving the second stale', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');
    const region = '<!-- codeassembly-ambient:start -->\n<!-- codeassembly-ambient:end -->';
    const doubled = `${region}\n\n# Personal notes\n\n${region}\n`;
    await writeFile(localHostPath(), doubled, 'utf8');

    await expect(syncCommand(makeOptions(), projectRoot, homeDir)).rejects.toThrow(/damaged ambient region/);

    expect(await readFile(localHostPath(), 'utf8')).toBe(doubled);
  });

  it('warns about an unignored local host in dry-run as well as on a live run', async () => {
    await execFileAsync('git', ['-C', projectRoot, 'init', '--quiet']);
    await writeFile(path.join(projectRoot, '.gitignore'), 'node_modules/\n', 'utf8');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');

    const warnings = renderReportLines(await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir), {
      dryRun: true,
      level: 'warn',
    });

    expect(warnings.filter((line) => line.includes('is not git-ignored'))).toHaveLength(1);
    expect(existsSync(localHostPath())).toBe(false);
  });

  it('warns once when the local host that it writes is not git-ignored', async () => {
    await execFileAsync('git', ['-C', projectRoot, 'init', '--quiet']);
    await writeFile(path.join(projectRoot, '.gitignore'), 'node_modules/\n', 'utf8');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');

    const warnings = renderReportLines(await syncCommand(makeOptions(), projectRoot, homeDir), {
      level: 'warn',
    });

    const notIgnored = warnings.filter((line) => line.includes('is not git-ignored'));
    expect(notIgnored).toHaveLength(1);
    expect(notIgnored[0]).toContain(localHostPath());
    expect(notIgnored[0]).toContain('.gitignore');
  });

  it('stays silent when the local host is git-ignored', async () => {
    await execFileAsync('git', ['-C', projectRoot, 'init', '--quiet']);
    await writeFile(path.join(projectRoot, '.gitignore'), '*.local.*\n', 'utf8');
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');

    const output = renderReportText(await syncCommand(makeOptions(), projectRoot, homeDir), {
      level: 'warn',
    });
    expect(output).not.toContain('is not git-ignored');
  });

  it('stays silent when the project is not a repository and the check cannot answer', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');

    const output = renderReportText(await syncCommand(makeOptions(), projectRoot, homeDir), {
      level: 'warn',
    });
    expect(output).not.toContain('is not git-ignored');
  });

  it('does not check the ignore status of a host that it is not writing', async () => {
    await execFileAsync('git', ['-C', projectRoot, 'init', '--quiet']);
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');

    const output = renderReportText(await syncCommand(makeOptions(), projectRoot, homeDir), {
      level: 'warn',
    });
    expect(output).not.toContain('is not git-ignored');
  });

  it('in dry-run mode, writes nothing to disk', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await writeFixtureRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('alpha', 'gamma');

    await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir);

    expect(existsSync(localHostPath())).toBe(false);
    expect(existsSync(skillPath('consult-gamma'))).toBe(false);
  });

  it('in dry-run mode, names each local host and the action that it would take', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');

    const output = renderReportText(await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir), {
      dryRun: true,
      level: 'info',
    });

    expect(output).toContain(`create ${localHostPath()}, containing the ambient region`);
  });

  it('in dry-run mode, reports appending to a local host that already exists', async () => {
    await writeFixtureRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');
    await writeFile(localHostPath(), '# Personal notes\n', 'utf8');

    const output = renderReportText(await syncCommand(makeOptions({ dryRun: true }), projectRoot, homeDir), {
      dryRun: true,
      level: 'info',
    });

    expect(output).toContain(`append the ambient region to ${localHostPath()}`);
    expect(await readFile(localHostPath(), 'utf8')).toBe('# Personal notes\n');
  });
});
