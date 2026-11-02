import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { makeStore, seedEvents } from '../../lesson-clusters/test-utils/seed-store.ts';
import { buildHelp, runCli } from '../cli.ts';
import type { CurateGit } from '../git.ts';

const SHA = 'b'.repeat(40);
const TICKET = 'https://github.com/acme/guide/issues/7';

/** A git adapter that pins every directory to one repository and reports every path as present. */
const fakeGit: CurateGit = {
  fetchBranchHead: () => SHA,
  findDefaultBranch: () => 'main',
  findTopLevel: () => '/repos/guide',
  hasFileAt: () => true,
  readOriginUrl: () => 'git@github.com:acme/guide.git',
};

describe(runCli, () => {
  it('runs references, pin, assign, validate, and render end to end', async () => {
    const { storePath, home } = await makeStore('fixture');
    await seedEvents(storePath, [{ id: '01A' }, { id: '01B' }, { id: '01Z', addressedBy: [TICKET] }]);
    const work = await mkdtemp(join(tmpdir(), 'curate-cli-'));
    const context = { cwd: work, home, git: fakeGit };
    const run = (...argv: string[]) => runCli(argv, context);

    await writeFile(
      join(work, 'inventory.json'),
      JSON.stringify({
        store: 'fixture',
        pool: ['01A', '01B'].map((id) => ({ id, summary: id, capturedAt: '2026-01-01T00:00:00Z', excerpt: '' })),
        deferred: [],
        skipped: [],
      }),
      'utf8',
    );
    await writeFile(
      join(work, 'map.json'),
      JSON.stringify({ clusters: [{ id: 'one', lesson: 'One.', eventIds: ['01A', '01B'] }] }),
      'utf8',
    );

    expect(await run('references', '--store', 'fixture', '--out', 'references.json')).toMatchObject({
      ok: true,
      references: 1,
    });
    expect(await run('pin', '--source', work, '--source', tmpdir(), '--out', 'pins.json')).toMatchObject({
      ok: true,
      pins: [`acme/guide@${SHA}`],
    });
    expect(
      await run(
        'assign',
        '--inventory',
        'inventory.json',
        '--map',
        'map.json',
        '--references',
        'references.json',
        '--pins',
        'pins.json',
        '--out',
        'assignments',
      ),
    ).toMatchObject({ ok: true, assignments: [{ clusters: 1, events: 2 }] });

    await writeFile(
      join(work, 'assignments', 'bins-01.json'),
      JSON.stringify({
        events: [
          { id: '01A', bin: 'covered', source: 'acme/guide', path: 'rules/a.md', reason: 'States it.' },
          { id: '01B', bin: 'duplicate', duplicateOf: '01Z', reason: 'Same lesson.' },
        ],
      }),
      'utf8',
    );
    expect(await run('validate', '--assignments', 'assignments', '--out', 'record.json')).toMatchObject({
      ok: true,
      counts: ['- covered: 1', '- duplicate: 1', '- obsolete: 0', '- kept: 0'],
      marks: 2,
    });
    expect(await run('render', '--file', 'record.json', '--out', 'artifact.md')).toMatchObject({ ok: true });
    expect(await readFile(join(work, 'artifact.md'), 'utf8')).toContain(
      `<https://github.com/acme/guide/blob/${SHA}/rules/a.md>`,
    );
  });

  it('reports a missing bins file as a violation rather than failing the command', async () => {
    const work = await mkdtemp(join(tmpdir(), 'curate-cli-'));
    await writeFile(
      join(work, 'assignment-01.json'),
      JSON.stringify({ store: 'fixture', clusters: [], references: [], pins: [] }),
      'utf8',
    );

    const result = await runCli(['validate', '--assignments', work, '--out', join(work, 'record.json')], {
      cwd: work,
      git: fakeGit,
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid-bins', violations: [{ event: null }] });
  });

  it('refuses an unknown command, a repeated single-valued flag, and a pin without a source', async () => {
    const context = { cwd: tmpdir(), git: fakeGit };

    expect(await runCli(['curate'], context)).toMatchObject({ ok: false, error: 'invalid-args' });
    expect(await runCli(['render', '--file', 'a', '--file', 'b', '--out', 'c'], context)).toMatchObject({
      ok: false,
      error: 'invalid-args',
    });
    expect(await runCli(['pin', '--out', 'pins.json'], context)).toMatchObject({ ok: false, error: 'invalid-args' });
  });

  it('documents every command in its help', () => {
    const help = buildHelp();

    for (const command of ['references', 'pin', 'assign', 'validate', 'render']) {
      expect(help).toContain(`curate-feedback ${command}`);
    }
  });
});
