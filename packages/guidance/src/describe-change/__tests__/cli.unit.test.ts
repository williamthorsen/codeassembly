import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import type { ChangeEntry } from '../change-entries.ts';
import {
  readChangeRecordBlock,
  renderChangeRecordBlock,
  renderMergeChangeRecordBlock,
} from '../change-record-block.ts';
import { runDescribe } from '../cli.ts';
import { parseArgs } from '../parse-args.ts';
import {
  DATA_DIR,
  HOUSE_TEMPLATES,
  LABEL_MAP,
  makePullRequestRepo,
  makeRepo,
  pullRequestFlags,
  writeAgentsPreferences,
  writeBody,
  writeLabelMap,
} from '../test-utils/cli-fixtures.ts';
import { makeFakeGit } from '../test-utils/make-fake-git.ts';
import { SUBCOMMAND_NAMES } from '../test-utils/subcommand-names.ts';

describe('subcommand dispatch', () => {
  it('if the invocation omits a subcommand, refuses with a usage error listing every subcommand', () => {
    expect(() => parseArgs([])).toThrow(
      `a subcommand is required; usage: describe-change <subcommand> [flags], where <subcommand> is one of ${SUBCOMMAND_NAMES.join(', ')}`,
    );
  });

  it('if a flag is passed in place of a subcommand, refuses it as unknown', () => {
    expect(() => parseArgs(['--base', 'main'])).toThrow(/^unknown subcommand --base; usage: /);
  });

  it('matches a subcommand only in the first position', () => {
    expect(() => parseArgs(['--title', 'Add foo', 'render-titles'])).toThrow(/unknown subcommand --title/);
  });
});

describe('--project-root', () => {
  const TARGET_TEMPLATES = "ticket:\n  title_format: '[{scope}|]{title}'";

  it('renders titles from the named root’s templates rather than the invoking repository’s', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const target = await makeRoot(TARGET_TEMPLATES);

    const argv = ['render-titles', '--project-root', target, '--scope', 'kb', '--title', 'Add foo'];
    const { output, warnings } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ commit_title: '', ticket_title: 'kb|Add foo' });
    expect(warnings).toStrictEqual([]);
  });

  it('resolves labels through the named root’s label map rather than the invoking repository’s', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    await writeLabelMap(cwd, LABEL_MAP);
    const target = await makeRoot('');
    await writeLabelMap(target, { scopes: { guidance: 'scope:guidance' }, types: { feat: 'enhancement' } });

    const argv = ['resolve-labels', '--project-root', target, '--scope', 'guidance', '--type', 'feat'];
    const { output, warnings } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ labels: ['enhancement', 'scope:guidance'] });
    expect(warnings).toStrictEqual([]);
  });

  it('resolves a relative root against the invoking directory', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    await writeLabelMap(join(cwd, 'target'), { scopes: {}, types: { fix: 'bug' } });

    const argv = ['resolve-labels', '--project-root', 'target', '--type', 'fix'];
    const { output } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ labels: ['bug'] });
  });

  it('refuses a root that does not exist, naming it', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const missing = join(cwd, 'absent');

    await expect(
      runDescribe({ argv: ['resolve-labels', '--project-root', missing], cwd, git, dataDir: DATA_DIR, home }),
    ).rejects.toThrow(`--project-root ${missing} cannot be read`);
  });

  it('refuses a root that is a file', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const file = join(cwd, '.agents', 'preferences.yaml');

    await expect(
      runDescribe({ argv: ['render-titles', '--project-root', file], cwd, git, dataDir: DATA_DIR, home }),
    ).rejects.toThrow(`--project-root ${file} is not a directory`);
  });

  it('refuses an empty value', () => {
    expect(() => parseArgs(['render-titles', '--project-root', ' '])).toThrow('--project-root requires a value');
  });

  it('is refused as unknown by a subcommand other than render-titles and resolve-labels', () => {
    expect(() => parseArgs(['consolidate-branch', '--base', 'main', '--project-root', '.'])).toThrow(
      'unknown flag: --project-root',
    );
  });
});

describe('check-merge-body', () => {
  const MERGE_BLOCK = renderMergeChangeRecordBlock({
    entries: [{ breaking: false, scopes: ['agents'], text: 'Adds the parser', type: 'feat' }],
    prNumber: 470,
    ticketRef: '#466',
  });

  it('reads the body file and the expected entry count', () => {
    expect(parseArgs(['check-merge-body', '--body-file', 'body.md', '--entry-count', '2'])).toStrictEqual({
      bodyFile: 'body.md',
      entryCount: 2,
      subcommand: 'check-merge-body',
    });
  });

  it.each(['--body-file', '--entry-count'])('if %s is missing, refuses the invocation', (flag) => {
    const argv = ['check-merge-body', '--body-file', 'body.md', '--entry-count', '2'];
    const index = argv.indexOf(flag);

    expect(() => parseArgs(argv.toSpliced(index, 2))).toThrow(`check-merge-body requires ${flag}`);
  });

  it('if the entry count is not a non-negative integer, refuses it', () => {
    expect(() => parseArgs(['check-merge-body', '--body-file', 'body.md', '--entry-count', '-1'])).toThrow(
      /--entry-count takes a non-negative integer/,
    );
  });

  it('passes a body whose block records the expected entry count', async () => {
    const bodyFile = await writeBody(`Adds the parser.\n\n${MERGE_BLOCK}\n`);

    const { output } = await runCheck(bodyFile, 1);

    expect(output).toStrictEqual({ entry_count: 1 });
  });

  it('passes a body without a block when the expected entry count is zero', async () => {
    const { output } = await runCheck(await writeBody('Adds the parser.\n'), 0);

    expect(output).toStrictEqual({ entry_count: 0 });
  });

  it('refuses a body whose block records a different entry count', async () => {
    const bodyFile = await writeBody(`Adds the parser.\n\n${MERGE_BLOCK}\n`);

    await expect(runCheck(bodyFile, 2)).rejects.toThrow('the merge body records 1 change entries; expected 2');
  });

  it('refuses a body without a block when entries are expected', async () => {
    await expect(runCheck(await writeBody('Adds the parser.\n'), 1)).rejects.toThrow(
      'the merge body records 0 change entries; expected 1',
    );
  });

  it('refuses a body containing a block when the expected entry count is zero', async () => {
    const bodyFile = await writeBody(`Adds the parser.\n\n${MERGE_BLOCK}\n`);

    await expect(runCheck(bodyFile, 0)).rejects.toThrow(
      /contains a change-record block, but the expected entry count is 0/,
    );
  });

  it('refuses a body whose block is malformed, naming the defect', async () => {
    const bodyFile = await writeBody('Adds the parser.\n\n```change-record\npr_number: "470"\nentries: []\n```\n');

    await expect(runCheck(bodyFile, 0)).rejects.toThrow('`pr_number` is not a positive integer');
  });

  it('refuses a body file that cannot be read', async () => {
    await expect(runCheck(join(tmpdir(), 'absent-merge-body.md'), 0)).rejects.toThrow(/--body-file .* cannot be read/);
  });
});

describe('amend-entry', () => {
  const ENTRIES: ChangeEntry[] = [
    { breaking: false, scopes: ['agents'], text: 'Adds the parser', type: 'feature' },
    { breaking: false, scopes: ['agents'], text: 'Corrects the guard', type: 'fix' },
  ];

  it('reads the body file, the entry index, and the amended fields', () => {
    expect(
      parseArgs(['amend-entry', '--body-file', 'body.md', '--entry', '1', '--type', 'feat', '--no-breaking']),
    ).toStrictEqual({
      amendment: { breaking: false, type: 'feat' },
      bodyFile: 'body.md',
      entryIndex: 1,
      subcommand: 'amend-entry',
    });
    expect(parseArgs(['amend-entry', '--body-file', 'body.md', '--entry', '0', '--breaking'])).toStrictEqual({
      amendment: { breaking: true },
      bodyFile: 'body.md',
      entryIndex: 0,
      subcommand: 'amend-entry',
    });
  });

  it.each(['--body-file', '--entry'])('if %s is missing, refuses the invocation', (flag) => {
    const argv = ['amend-entry', '--body-file', 'body.md', '--entry', '0', '--type', 'feat'];
    const index = argv.indexOf(flag);

    expect(() => parseArgs(argv.toSpliced(index, 2))).toThrow(`amend-entry requires ${flag}`);
  });

  it.each([
    [['--entry', '-1', '--type', 'feat'], /--entry takes the entry’s 0-based index; got -1/],
    [['--entry', '0'], 'amend-entry requires --type, --breaking, or --no-breaking'],
    [['--entry', '0', '--breaking', '--no-breaking'], /opposite directions/],
    [['--entry', '0', '--type', 'feat!'], '--type takes a bare type; pass --breaking for a breaking change'],
    [['--entry', '0', '--type', ' '], '--type requires a value'],
  ])('refuses %j', (flags, message) => {
    expect(() => parseArgs(['amend-entry', '--body-file', 'body.md', ...flags])).toThrow(message);
  });

  it('rewrites the entry in the body file and reports it with the entry count', async () => {
    const block = renderChangeRecordBlock({ entries: ENTRIES, entriesCommit: 'abc1234', title: 'Add the parser' });
    const bodyFile = await writeBody(`## What\n\n- Adds the parser.\n\n${block}\n`);

    const { output } = await runAmend(bodyFile, ['--entry', '0', '--type', 'feat']);

    expect(output).toStrictEqual({ entry: { ...ENTRIES[0], type: 'feat' }, entry_count: 2 });
    const body = await readFile(bodyFile, 'utf8');
    expect(body.startsWith('## What\n\n- Adds the parser.\n\n```change-record\n')).toBe(true);
    expect(readChangeRecordBlock(body)).toMatchObject({
      block: { entries: [{ ...ENTRIES[0], type: 'feat' }, ENTRIES[1]], entriesCommit: 'abc1234' },
      kind: 'read',
    });
  });

  it('refuses an amendment that leaves the entry defective, leaving the file untouched', async () => {
    const content = `${renderChangeRecordBlock({ entries: ENTRIES, title: 'Add the parser' })}\n`;
    const bodyFile = await writeBody(content);

    await expect(runAmend(bodyFile, ['--entry', '0', '--type', 'feature'])).rejects.toThrow(
      'the amendment leaves entries[0] defective: the taxonomy does not declare the type feature',
    );
    await expect(readFile(bodyFile, 'utf8')).resolves.toBe(content);
  });

  it('refuses a body file that cannot be read', async () => {
    await expect(runAmend(join(tmpdir(), 'absent-pr-body.md'), ['--entry', '0', '--type', 'feat'])).rejects.toThrow(
      /--body-file .* cannot be read/,
    );
  });

  it('clears the entry defect that resolve-merge reports', async () => {
    const { cwd, git, headCommit, home } = await makePullRequestRepo(['agents|feat: Add the parser']);
    const block = renderChangeRecordBlock({
      entries: ENTRIES.slice(0, 1),
      entriesCommit: headCommit.slice(0, 8),
      title: 'Add the parser',
    });
    const bodyFile = await writeBody(`## What\n\n- Adds the parser.\n\n${block}\n`);
    const resolve = async (): Promise<unknown> => {
      const argv = ['resolve-merge', '--base', 'base', '--head', headCommit, ...pullRequestFlags(bodyFile)];
      const { output } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });
      return output;
    };

    await expect(resolve()).resolves.toMatchObject({
      defects: [{ entry: 0, kind: 'undeclared-type', type: 'feature' }, { kind: 'missing-type' }],
    });
    await runAmend(bodyFile, ['--entry', '0', '--type', 'feat']);
    await expect(resolve()).resolves.toMatchObject({ defects: [] });
  });
});

// region | Helpers

/** Creates a directory standing in for another repository's root, with the given preferences. */
async function makeRoot(content: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'describe-change-root-'));
  await writeAgentsPreferences(root, content);
  return root;
}

/** Runs `amend-entry` in process against a body file and the flags given. */
async function runAmend(bodyFile: string, flags: readonly string[]): ReturnType<typeof runDescribe> {
  return runDescribe({
    argv: ['amend-entry', '--body-file', bodyFile, ...flags],
    cwd: process.cwd(),
    git: makeFakeGit(),
    dataDir: DATA_DIR,
    home: tmpdir(),
  });
}

/** Runs `check-merge-body` in process against a body file and an expected entry count. */
async function runCheck(bodyFile: string, entryCount: number): ReturnType<typeof runDescribe> {
  return runDescribe({
    argv: ['check-merge-body', '--body-file', bodyFile, '--entry-count', String(entryCount)],
    cwd: process.cwd(),
    git: makeFakeGit(),
    dataDir: DATA_DIR,
    home: tmpdir(),
  });
}

// endregion | Helpers
