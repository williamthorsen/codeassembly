import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runDescribe } from '../cli.ts';
import { parseArgs } from '../parse-args.ts';
import { DATA_DIR, ENTRIES_YAML, HOUSE_TEMPLATES, makeRepo, writeEntries } from '../test-utils/cli-fixtures.ts';
import { type FakeGit, makeFakeGit, makeRawCommit } from '../test-utils/make-fake-git.ts';
import type { ConsolidateBranchOutcome, EntryOutcome } from '../types.ts';

/** The `consolidate-branch` invocation that reads the range from `base`. */
const CONSOLIDATE_BASE = ['consolidate-branch', '--base', 'base'];

describe('consolidate-branch', () => {
  it('reads the base ref', () => {
    expect(parseArgs(['consolidate-branch', '--base', 'main'])).toEqual({
      baseRef: 'main',
      subcommand: 'consolidate-branch',
    });
  });

  it('if --base is missing, refuses the invocation', () => {
    expect(() => parseArgs(['consolidate-branch'])).toThrow('consolidate-branch requires --base');
  });

  it('refuses a record flag', () => {
    expect(() => parseArgs(['consolidate-branch', '--base', 'main', '--title', 'Add foo'])).toThrow(
      'unknown flag: --title',
    );
  });

  it('refuses --ticket-label, which resolve-ticket-type takes', () => {
    expect(() => parseArgs(['consolidate-branch', '--base', 'main', '--ticket-label', 'feature'])).toThrow(
      'unknown flag: --ticket-label',
    );
  });

  it('lets one feat represent a branch containing three fixes', async () => {
    const { cwd, git, home } = await makeCommittedRepo([
      'agents|fix: Correct the guard',
      'agents|feat: Add the parser',
      'agents|fix: Correct the other guard',
      'agents|fix: Correct the third guard',
    ]);

    const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ consolidated_record: { breaking: false, scope: 'agents', type: 'feat' } });
  });

  it('sets the breaking marker on the consolidated record', async () => {
    const { cwd, git, home } = await makeCommittedRepo([
      'agents|sec!: Patch the parser',
      'agents|fix: Correct the guard',
    ]);

    const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ consolidated_record: { breaking: true, scope: 'agents', type: 'sec' } });
  });

  it('lists an unmatched subject and keeps it out of the entries', async () => {
    const { cwd, git, home } = await makeCommittedRepo(['agents|feat: Add the parser', 'wip']);

    const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({
      entries: [{ scope: 'agents', type: 'feat' }],
      unmatched: [{ subject: 'wip' }],
    });
  });

  it('reports a refactor that spells the marker forbidden by its policy', async () => {
    const { cwd, git, home } = await makeCommittedRepo(['agents|refactor!: Restructure the guard']);

    const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ violations: [{ policy: 'forbidden', type: 'refactor' }] });
  });

  it('yields a consolidated record whose fields are all null for a range without commits', async () => {
    const { cwd, git, home } = await makeCommittedRepo([]);

    const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({
      entries: [],
      consolidated_record: { breaking: null, scope: null, type: null },
      unmatched: [],
      violations: [],
    });
  });

  it('takes a commit’s Change trailers in place of its subject', async () => {
    const { cwd, git, home } = await makeCommittedRepo([
      [
        'agents|fix: Squash the branch',
        '',
        'Change: agents|feat: Add the parser',
        'Change: agents|fix: Correct the guard',
      ].join('\n'),
    ]);

    const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({
      entries: [{ type: 'feat' }, { type: 'fix' }],
      consolidated_record: { scope: 'agents', type: 'feat' },
    });
  });

  it('when a subject names a ticket reference, renders its change without it', async () => {
    const { cwd, git, home } = await makeCommittedRepo(['#466 agents|feat!: Add the parser']);

    const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ entries: [{ change: 'agents|feat!: Add the parser' }] });
  });

  it('when each entry’s change is written as a Change trailer, consolidates back to the same entries', async () => {
    const original = await consolidateMessages([
      'agents|feat!: Add the parser, the renderer, and the verifier',
      '#466 agents|fix: Correct the guard',
      'kb|docs: Describe the store',
    ]);
    const trailers = original.entries.map((entry) => `Change: ${entry.change}`);

    const condensed = await consolidateMessages([
      ['agents|feat!: Condense the branch', '', 'Adds the parser.', '', ...trailers].join('\n'),
    ]);

    expect(condensed.entries.map(omitCommit)).toStrictEqual(original.entries.map(omitCommit));
  });

  it('refuses when the data directory does not contain a readable taxonomy', async () => {
    const { cwd, git, home } = await makeCommittedRepo(['agents|feat: Add the parser']);
    const dataDir = await mkdtemp(join(tmpdir(), 'describe-change-data-'));

    await expect(runDescribe({ argv: CONSOLIDATE_BASE, cwd, git, dataDir, home })).rejects.toThrow(
      /consolidate-branch ranks types against the taxonomy/,
    );
  });
});

describe('consolidate-entries', () => {
  it('reads the entries file', () => {
    expect(parseArgs(['consolidate-entries', '--entries-file', 'entries.yaml'])).toEqual({
      entriesFile: 'entries.yaml',
      subcommand: 'consolidate-entries',
    });
  });

  it.each([
    ['is missing', []],
    ['is blank', ['--entries-file', ' ']],
  ])('if --entries-file %s, refuses the invocation', (_label, flags) => {
    expect(() => parseArgs(['consolidate-entries', ...flags])).toThrow('consolidate-entries requires --entries-file');
  });

  it.each(['--title', '--entries-commit', '--base'])('if %s is passed, refuses it as unknown', (flag) => {
    expect(() => parseArgs(['consolidate-entries', flag, 'value'])).toThrow(`unknown flag: ${flag}`);
  });

  it('consolidates the entries to the scope that they agree on and their highest-ranked type', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const entriesFile = await writeEntries(ENTRIES_YAML);

    const { output } = await runDescribe({
      argv: ['consolidate-entries', '--entries-file', entriesFile],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toStrictEqual({
      consolidated_record: { breaking: false, scope: 'agents', type: 'feat' },
      defects: [],
    });
  });

  it('drops the scope when the entries name different ones, and reports a breaking entry', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const entriesFile = await writeEntries(
      [
        '- type: feat',
        '  scopes: [agents]',
        '  breaking: true',
        '  text: Adds foo',
        '- type: fix',
        '  scopes: [kb]',
        '  breaking: false',
        '  text: Corrects the guard',
      ].join('\n'),
    );

    const { output } = await runDescribe({
      argv: ['consolidate-entries', '--entries-file', entriesFile],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toStrictEqual({
      consolidated_record: { breaking: true, scope: null, type: 'feat' },
      defects: [],
    });
  });

  it('determines nothing from an empty list', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const entriesFile = await writeEntries('[]');

    const { output } = await runDescribe({
      argv: ['consolidate-entries', '--entries-file', entriesFile],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toStrictEqual({
      consolidated_record: { breaking: null, scope: null, type: null },
      defects: [],
    });
  });

  it('reports each entry whose breaking marker breaks its policy or whose type is undeclared, by index', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const entriesFile = await writeEntries(
      [
        '- type: feat',
        '  text: Adds foo',
        '- type: refactor',
        '  breaking: true',
        '  text: Restructures the parser',
        '- type: chore',
        '  text: Tidies the config',
      ].join('\n'),
    );

    const { output } = await runDescribe({
      argv: ['consolidate-entries', '--entries-file', entriesFile],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({
      defects: [
        { entry: 1, kind: 'policy-violation', policy: 'forbidden', type: 'refactor' },
        { entry: 2, kind: 'undeclared-type', type: 'chore' },
      ],
    });
  });

  it('if the entries file cannot be read, refuses the invocation', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

    await expect(
      runDescribe({
        argv: ['consolidate-entries', '--entries-file', join(cwd, 'absent.yaml')],
        cwd,
        git,
        dataDir: DATA_DIR,
        home,
      }),
    ).rejects.toThrow(/--entries-file .*absent\.yaml cannot be read/);
  });

  it('if the entries file is malformed, refuses the invocation and names the defect', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const entriesFile = await writeEntries('- type: feat');

    await expect(
      runDescribe({ argv: ['consolidate-entries', '--entries-file', entriesFile], cwd, git, dataDir: DATA_DIR, home }),
    ).rejects.toThrow(/is malformed: `entries\[0\]\.text` is missing/);
  });

  it('if a YAML comment cuts an entry short, refuses the invocation ahead of any other defect', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const entriesFile = await writeEntries(
      '- type: feat\n- type: fix\n  text: Leaves no release flow until #19 lands.',
    );

    await expect(
      runDescribe({ argv: ['consolidate-entries', '--entries-file', entriesFile], cwd, git, dataDir: DATA_DIR, home }),
    ).rejects.toThrow(/is malformed: `entries\[1\]\.text` is cut short by a YAML comment \(`#19 lands\.`\)/);
  });

  it('if the entries file is not valid YAML, refuses the invocation', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const entriesFile = await writeEntries('- type: [unclosed');

    await expect(
      runDescribe({ argv: ['consolidate-entries', '--entries-file', entriesFile], cwd, git, dataDir: DATA_DIR, home }),
    ).rejects.toThrow(/is not valid YAML/);
  });

  it('if the data directory does not contain a readable taxonomy, refuses the invocation', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const entriesFile = await writeEntries(ENTRIES_YAML);
    const dataDir = join(cwd, 'absent-data');

    await expect(
      runDescribe({ argv: ['consolidate-entries', '--entries-file', entriesFile], cwd, git, dataDir, home }),
    ).rejects.toThrow(/consolidate-entries ranks types against the taxonomy; none is readable/);
  });
});

describe('render-details', () => {
  it('reads the entries file', () => {
    expect(parseArgs(['render-details', '--entries-file', 'entries.yaml'])).toEqual({
      entriesFile: 'entries.yaml',
      subcommand: 'render-details',
    });
  });

  it.each([
    ['is missing', []],
    ['is blank', ['--entries-file', ' ']],
  ])('if --entries-file %s, refuses the invocation', (_label, flags) => {
    expect(() => parseArgs(['render-details', ...flags])).toThrow('render-details requires --entries-file');
  });

  it.each(['--title', '--entries-commit'])('if %s is passed, refuses it as unknown', (flag) => {
    expect(() => parseArgs(['render-details', flag, 'value'])).toThrow(`unknown flag: ${flag}`);
  });

  it('renders the Details body from the entries file against the embedded taxonomy', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const entriesFile = await writeEntries(ENTRIES_YAML);

    const { output, warnings } = await runDescribe({
      argv: ['render-details', '--entries-file', entriesFile],
      cwd,
      git,
      home,
    });

    expect(output).toStrictEqual({
      details: [
        '### 🎉 Features',
        '',
        '- Adds the store-qualified wikilink',
        '',
        '### 🐛 Bug fixes',
        '',
        '- Stops the sync from deleting a subagent',
      ].join('\n'),
    });
    expect(warnings).toEqual([]);
  });

  it('if the entries file is malformed, refuses the invocation and names the defect', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const entriesFile = await writeEntries('- type: feat');

    await expect(
      runDescribe({ argv: ['render-details', '--entries-file', entriesFile], cwd, git, home }),
    ).rejects.toThrow(/is malformed: `entries\[0\]\.text` is missing/);
  });

  it('if the data directory does not contain a readable taxonomy, refuses the invocation', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const entriesFile = await writeEntries(ENTRIES_YAML);
    const dataDir = join(cwd, 'absent-data');

    await expect(
      runDescribe({ argv: ['render-details', '--entries-file', entriesFile], cwd, git, dataDir, home }),
    ).rejects.toThrow(/render-details orders and heads the entries by the taxonomy; none is readable/);
  });

  it('if the taxonomy does not declare the headings, refuses the invocation', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const entriesFile = await writeEntries(ENTRIES_YAML);

    await expect(
      runDescribe({ argv: ['render-details', '--entries-file', entriesFile], cwd, git, dataDir: DATA_DIR, home }),
    ).rejects.toThrow(/lacks an `emoji` or `label` for `markers\.breaking` or a type/);
  });
});

// region | Helpers

/** Consolidates a project with one commit per message, returning the `consolidate-branch` output. */
async function consolidateMessages(messages: readonly string[]): Promise<ConsolidateBranchOutcome> {
  const { cwd, git, home } = await makeCommittedRepo(messages);
  const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, git, dataDir: DATA_DIR, home });
  if (!('entries' in output)) {
    throw new Error(`consolidate-branch did not report entries: ${JSON.stringify(output)}`);
  }
  return output;
}

/** Creates a project whose fake git lists one commit per message, so that `consolidate-branch` reads exactly those. */
async function makeCommittedRepo(messages: readonly string[]): Promise<{ cwd: string; git: FakeGit; home: string }> {
  const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);
  const git = makeFakeGit({ commits: messages.map(makeRawCommit), topLevel: cwd });
  return { cwd, git, home };
}

/** Drops the commit hash from an entry, which differs between two commit lists with the same entries. */
function omitCommit(entry: EntryOutcome): Omit<EntryOutcome, 'commit'> {
  const { commit: _commit, ...rest } = entry;
  return rest;
}

// endregion | Helpers
