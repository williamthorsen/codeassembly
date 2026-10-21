import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderChangeRecordBlock } from '../change-record-block.ts';
import { runDescribe } from '../cli.ts';
import { parseArgs } from '../parse-args.ts';
import {
  DATA_DIR,
  DEFECTIVE_TEMPLATES,
  ENTRIES_YAML,
  HOUSE_TEMPLATES,
  makeRepo,
  writeAgentsPreferences,
  writeEntries,
  writeLabelMap,
} from '../test-utils/cli-fixtures.ts';
import { type FakeGit, makeFakeGit } from '../test-utils/make-fake-git.ts';

describe('resolve-scopes', () => {
  it('reads every path', () => {
    expect(parseArgs(['resolve-scopes', '--path', 'packages/kb/a.ts', '--path', 'AGENTS.md'])).toEqual({
      paths: ['packages/kb/a.ts', 'AGENTS.md'],
      subcommand: 'resolve-scopes',
    });
  });

  it('reads an invocation without a path', () => {
    expect(parseArgs(['resolve-scopes'])).toEqual({ paths: [], subcommand: 'resolve-scopes' });
  });

  it('refuses --base, which consolidate-branch takes', () => {
    expect(() => parseArgs(['resolve-scopes', '--base', 'main'])).toThrow('unknown flag: --base');
  });

  it('refuses a positional argument', () => {
    expect(() => parseArgs(['resolve-scopes', 'packages/kb/a.ts'])).toThrow('unexpected argument: packages/kb/a.ts');
  });

  it('reports each path’s scope and the union of those scopes', async () => {
    const { cwd, git, home } = await makeWorkspaceRepo();

    const argv = ['resolve-scopes', '--path', 'packages/kb/src/index.ts', '--path', 'AGENTS.md'];
    const { output, warnings } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({
      path_scopes: { 'packages/kb/src/index.ts': 'kb', 'AGENTS.md': 'root' },
      scopes: ['kb', 'root'],
    });
    expect(warnings).toStrictEqual([]);
  });

  it('resolves a pattern-matched directory without a manifest to root', async () => {
    const { cwd, git, home } = await makeWorkspaceRepo();

    const argv = ['resolve-scopes', '--path', 'packages/scripts/build.ts'];
    const { output } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ path_scopes: { 'packages/scripts/build.ts': 'root' }, scopes: ['root'] });
  });

  it('reads the workspace layout from the repository root rather than the invoking directory', async () => {
    const { cwd, git, home } = await makeWorkspaceRepo();
    const nested = join(cwd, 'packages', 'agents');

    const argv = ['resolve-scopes', '--path', 'packages/kb/src/index.ts'];
    const { output } = await runDescribe({ argv, cwd: nested, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ path_scopes: { 'packages/kb/src/index.ts': 'kb' }, scopes: ['kb'] });
  });

  it('resolves every path to root when the repository does not declare any workspaces', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

    const argv = ['resolve-scopes', '--path', 'packages/kb/src/index.ts'];
    const { output } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ path_scopes: { 'packages/kb/src/index.ts': 'root' }, scopes: ['root'] });
  });

  it('resolves a declared directory in a repository that does not declare any workspaces', async () => {
    const scopes = 'project:\n  scopes:\n    - path: apps/devopticon\n    - path: tools/ios-shell\n      name: ios';
    const { cwd, git, home } = await makeRepo(`${HOUSE_TEMPLATES}\n${scopes}`);
    await mkdir(join(cwd, 'apps', 'devopticon'), { recursive: true });
    await mkdir(join(cwd, 'tools', 'ios-shell'), { recursive: true });

    const argv = [
      'resolve-scopes',
      '--path',
      'apps/devopticon/Package.swift',
      '--path',
      'tools/ios-shell/App.swift',
      '--path',
      'AGENTS.md',
    ];
    const { output, warnings } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({
      path_scopes: {
        'apps/devopticon/Package.swift': 'devopticon',
        'tools/ios-shell/App.swift': 'ios',
        'AGENTS.md': 'root',
      },
      scopes: ['devopticon', 'ios', 'root'],
    });
    expect(warnings).toStrictEqual([]);
  });

  it('lets a declared name override the basename of a package directory', async () => {
    const { cwd, git, home } = await makeWorkspaceRepo();
    await writeAgentsPreferences(
      cwd,
      `${HOUSE_TEMPLATES}\nproject:\n  scopes:\n    - path: packages/kb\n      name: knowledge`,
    );

    const argv = ['resolve-scopes', '--path', 'packages/kb/src/index.ts', '--path', 'packages/agents/src/cli.ts'];
    const { output } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({
      path_scopes: { 'packages/kb/src/index.ts': 'knowledge', 'packages/agents/src/cli.ts': 'agents' },
      scopes: ['agents', 'knowledge'],
    });
  });

  it('warns about a faulty declared entry, skips it, and still resolves the valid one', async () => {
    const scopes = 'project:\n  scopes:\n    - path: apps/missing\n    - path: apps/devopticon';
    const { cwd, git, home } = await makeRepo(`${HOUSE_TEMPLATES}\n${scopes}`);
    await mkdir(join(cwd, 'apps', 'devopticon'), { recursive: true });

    const argv = ['resolve-scopes', '--path', 'apps/devopticon/Package.swift', '--path', 'apps/missing/x.swift'];
    const { output, warnings } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({
      path_scopes: { 'apps/devopticon/Package.swift': 'devopticon', 'apps/missing/x.swift': 'root' },
      scopes: ['devopticon', 'root'],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(
      /preferences\.yaml: project\.scopes\[0\] has a path apps\/missing that does not exist; skipping it$/,
    );
  });

  it('ignores scopes declared in the global preferences file', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    await mkdir(join(cwd, 'apps', 'devopticon'), { recursive: true });
    await writeAgentsPreferences(home, 'project:\n  scopes:\n    - path: apps/devopticon');

    const argv = ['resolve-scopes', '--path', 'apps/devopticon/Package.swift'];
    const { output, warnings } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ path_scopes: { 'apps/devopticon/Package.swift': 'root' }, scopes: ['root'] });
    expect(warnings).toStrictEqual([]);
  });

  it('reports an empty scope list when the invocation omits a path', async () => {
    const { cwd, git, home } = await makeWorkspaceRepo();

    const { output } = await runDescribe({ argv: ['resolve-scopes'], cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ path_scopes: {}, scopes: [] });
  });

  it('warns and anchors at the invoking directory when git cannot resolve a repository root', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'describe-change-bare-'));
    const git = makeFakeGit();
    const home = await mkdtemp(join(tmpdir(), 'describe-change-home-'));

    const argv = ['resolve-scopes', '--path', 'AGENTS.md'];
    const { output, warnings } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ path_scopes: { 'AGENTS.md': 'root' }, scopes: ['root'] });
    expect(warnings[0]).toMatch(/^git could not resolve the repository root/);
  });
});

describe('resolve-ticket-type', () => {
  it('reads every ticket label', () => {
    expect(parseArgs(['resolve-ticket-type', '--ticket-label', 'feature', '--ticket-label', 'scope:agents'])).toEqual({
      subcommand: 'resolve-ticket-type',
      ticketLabels: ['feature', 'scope:agents'],
    });
  });

  it('reads an invocation without a ticket label', () => {
    expect(parseArgs(['resolve-ticket-type'])).toEqual({ subcommand: 'resolve-ticket-type', ticketLabels: [] });
  });

  it('refuses --base, which consolidate-branch takes', () => {
    expect(() => parseArgs(['resolve-ticket-type', '--base', 'main'])).toThrow('unknown flag: --base');
  });

  it('resolves the ticket type from the labels and the repository’s label map', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    await writeLabelMap(cwd, { types: { feat: 'feature', fix: 'fix' } });

    const argv = ['resolve-ticket-type', '--ticket-label', 'fix', '--ticket-label', 'scope:agents'];
    const { output, warnings } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ ticket_type: 'fix' });
    expect(warnings).toStrictEqual([]);
  });

  it('reads the label map from the repository root rather than the invoking directory', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    await writeLabelMap(cwd, { types: { feat: 'feature' } });
    const nested = join(cwd, 'packages', 'agents');
    await mkdir(nested, { recursive: true });

    const argv = ['resolve-ticket-type', '--ticket-label', 'feature'];
    const { output } = await runDescribe({ argv, cwd: nested, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ ticket_type: 'feat' });
  });

  it('yields a null ticket type when the repository does not configure a label map', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

    const argv = ['resolve-ticket-type', '--ticket-label', 'feature'];
    const { output } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ ticket_type: null });
  });

  it('reads the entries file and the derivation commit', () => {
    const parsed = parseArgs([
      'render-block',
      '--title',
      'Add foo',
      '--entries-file',
      'entries.yaml',
      '--entries-commit',
      'e5029924',
    ]);

    expect(parsed).toEqual({
      block: { entriesCommit: 'e5029924', overrides: {}, title: 'Add foo' },
      entriesFile: 'entries.yaml',
      subcommand: 'render-block',
    });
  });

  it('if --entries-commit is passed without --entries-file, refuses the invocation', () => {
    expect(() => parseArgs(['render-block', '--title', 'Add foo', '--entries-commit', 'e5029924'])).toThrow(
      '--entries-commit records the commit at which the entries were derived; pass --entries-file too',
    );
  });

  it.each(['entries-commit', 'entries-file'])('if --%s is blank, refuses the invocation', (name) => {
    expect(() => parseArgs(['render-block', '--title', 'Add foo', `--${name}`, ' '])).toThrow(
      `--${name} requires a value`,
    );
  });

  it('records the entries and the derivation commit in the rendered block', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const entriesFile = await writeEntries(ENTRIES_YAML);

    const { output } = await runDescribe({
      argv: [
        'render-block',
        '--title',
        'Add the parser',
        '--entries-file',
        entriesFile,
        '--entries-commit',
        'e5029924',
      ],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toStrictEqual({
      block: renderChangeRecordBlock({
        entries: [
          { breaking: false, scopes: ['agents'], text: 'Adds the store-qualified wikilink', type: 'feat' },
          { breaking: false, scopes: ['agents'], text: 'Stops the sync from deleting a subagent', type: 'fix' },
        ],
        entriesCommit: 'e5029924',
        title: 'Add the parser',
      }),
    });
  });

  it('records an issue reference in a quoted entry text intact', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const text = 'Leaves no release flow until #19 adds the workflows.';
    const entriesFile = await writeEntries(`- type: fix\n  scopes: [agents]\n  text: "${text}"`);

    const { output } = await runDescribe({
      argv: ['render-block', '--title', 'Fix the flow', '--entries-file', entriesFile],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toStrictEqual({
      block: renderChangeRecordBlock({
        entries: [{ breaking: false, scopes: ['agents'], text, type: 'fix' }],
        title: 'Fix the flow',
      }),
    });
  });

  it('if a YAML comment cuts an entry short, refuses the invocation and names the entry', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const entriesFile = await writeEntries('- type: fix\n  text: Leaves no release flow until #19 lands.');

    await expect(
      runDescribe({
        argv: ['render-block', '--title', 'Fix the flow', '--entries-file', entriesFile],
        cwd,
        git,
        dataDir: DATA_DIR,
        home,
      }),
    ).rejects.toThrow(/is malformed: `entries\[0\]\.text` is cut short by a YAML comment/);
  });

  it('if the entries file cannot be read, refuses the invocation', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

    await expect(
      runDescribe({
        argv: ['render-block', '--title', 'Add foo', '--entries-file', join(cwd, 'absent.yaml')],
        cwd,
        git,
        dataDir: DATA_DIR,
        home,
      }),
    ).rejects.toThrow(/--entries-file .*absent\.yaml cannot be read/);
  });

  it('if the entries file is malformed, refuses the invocation and names the defect', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const entriesFile = await writeEntries('- text: Adds foo');

    await expect(
      runDescribe({
        argv: ['render-block', '--title', 'Add foo', '--entries-file', entriesFile],
        cwd,
        git,
        dataDir: DATA_DIR,
        home,
      }),
    ).rejects.toThrow(/is malformed: `entries\[0\]\.type` is missing/);
  });

  it('succeeds when a configured title template is defective', async () => {
    const { cwd, git, home } = await makeRepo(DEFECTIVE_TEMPLATES);
    await writeLabelMap(cwd, { types: { feat: 'feature' } });

    const argv = ['resolve-ticket-type', '--ticket-label', 'feature'];
    const { output } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ ticket_type: 'feat' });
  });
});

// region | Helpers

/**
 * Creates a project declaring `packages/*` as its workspaces, with `packages/agents` and `packages/kb`
 * containing a manifest and `packages/scripts` containing none.
 */
async function makeWorkspaceRepo(): Promise<{ cwd: string; git: FakeGit; home: string }> {
  const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
  for (const dir of ['packages/agents', 'packages/kb', 'packages/scripts']) {
    await mkdir(join(cwd, dir), { recursive: true });
  }
  for (const dir of ['packages/agents', 'packages/kb']) {
    await writeFile(join(cwd, dir, 'package.json'), '{}', 'utf8');
  }
  await writeFile(join(cwd, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n", 'utf8');
  return { cwd, git, home };
}

// endregion | Helpers
