import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ChangeEntry } from '../change-entries.ts';
import { renderChangeRecordBlock } from '../change-record-block.ts';
import { runDescribe } from '../cli.ts';
import { parseArgs } from '../parse-args.ts';
import {
  DATA_DIR,
  makePullRequestRepo,
  pullRequestFlags,
  writeAgentsPreferences,
  writeBody,
  writeLabelMap,
} from '../test-utils/cli-fixtures.ts';

describe('resolve-merge', () => {
  const REQUIRED = [
    '--base',
    'origin/main',
    '--head',
    'abc1234',
    '--pr-title',
    '#466 Add foo',
    '--pr-body-file',
    'body.md',
    '--pr-number',
    '470',
  ];

  it('reads the pull request’s inputs and every override', () => {
    const parsed = parseArgs([
      'resolve-merge',
      ...REQUIRED,
      '--pr-label',
      'feature',
      '--pr-label',
      'scope:agents',
      '--ticket-ref',
      '#466',
      '--override-scope',
      '*',
      '--override-type',
      'sec',
      '--no-override-breaking',
      '--override-title',
      'Add the parser',
    ]);

    expect(parsed).toEqual({
      merge: {
        baseRef: 'origin/main',
        headCommit: 'abc1234',
        overrides: { breaking: false, scope: '*', title: 'Add the parser', type: 'sec' },
        prBodyFile: 'body.md',
        prLabels: ['feature', 'scope:agents'],
        prNumber: '470',
        prTitle: '#466 Add foo',
        ticketRef: '#466',
      },
      subcommand: 'resolve-merge',
    });
  });

  it.each(['--base', '--head', '--pr-title', '--pr-body-file', '--pr-number'])(
    'if %s is missing, refuses the invocation',
    (flag) => {
      const index = REQUIRED.indexOf(flag);
      const argv = ['resolve-merge', ...REQUIRED.toSpliced(index, 2)];

      expect(() => parseArgs(argv)).toThrow(`resolve-merge requires ${flag}`);
    },
  );

  it.each(['--scope', '--type', '--title', '--ticket-label'])('if %s is passed, refuses it as unknown', (flag) => {
    expect(() => parseArgs(['resolve-merge', ...REQUIRED, flag, 'value'])).toThrow(`unknown flag: ${flag}`);
  });

  it('if both breaking overrides are passed, refuses the invocation', () => {
    const argv = ['resolve-merge', ...REQUIRED, '--override-breaking', '--no-override-breaking'];

    expect(() => parseArgs(argv)).toThrow(/opposite directions/);
  });

  it('if the type override spells the marker, refuses it', () => {
    const argv = ['resolve-merge', ...REQUIRED, '--override-type', 'feat!'];

    expect(() => parseArgs(argv)).toThrow(
      '--override-type takes a bare type; pass --override-breaking for a breaking change',
    );
  });

  it('if the pull-request number is not digits, refuses it', () => {
    const argv = ['resolve-merge', ...REQUIRED.slice(0, -1), '#470'];

    expect(() => parseArgs(argv)).toThrow(/--pr-number takes the pull request’s number/);
  });

  it('resolves a merge end to end from a body file, reading the commits to the pull request’s head commit', async () => {
    const { cwd, git, headCommit, home } = await makePullRequestRepo([
      'agents|feat: Add the parser',
      'agents|fix: Correct the guard',
    ]);
    await writeLabelMap(cwd, { types: { docs: 'documentation' } });
    const entries: ChangeEntry[] = [
      { breaking: false, scopes: ['agents'], text: 'Adds the parser', type: 'feat' },
      { breaking: false, scopes: ['agents'], text: 'Corrects the guard', type: 'fix' },
    ];
    const block = renderChangeRecordBlock({
      entries,
      entriesCommit: headCommit.slice(0, 8),
      title: 'Add the parser',
    });
    const bodyFile = await writeBody(`## What\n\n- Adds the parser.\n\nCloses #466\n\n${block}\n`);

    const { output } = await runDescribe({
      argv: [
        'resolve-merge',
        '--base',
        'base',
        '--head',
        headCommit,
        '--pr-title',
        '#466 Add the parser',
        '--pr-body-file',
        bodyFile,
        '--pr-number',
        '470',
        '--pr-label',
        'documentation',
      ],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toStrictEqual({
      effective_record: {
        title: 'Add the parser',
        scope: 'agents',
        type: 'feat',
        breaking: false,
        ticket_ref: '#466',
        pr_number: '470',
      },
      effective_sources: {
        title: 'pr_title',
        scope: 'block',
        type: 'block',
        breaking: 'block',
        ticket_ref: 'pr_title',
      },
      merge_title: '#466 agents|feat: Add the parser (#470)',
      body: '- Adds the parser.',
      merge_block: expect.stringMatching(/^```change-record\n/),
      entry_count: 2,
      sources: {
        block: {
          title: 'Add the parser',
          overrides: {},
          entries_commit: headCommit.slice(0, 8),
          entries,
        },
        commits: { scope: 'agents', type: 'feat', breaking: false },
        labels: { scope: null, type: 'docs', breaking: false },
        pr_title: { title: 'Add the parser', ticket_ref: '#466', scope: null, type: null, breaking: null },
      },
      defects: [],
      notices: [],
    });
    expect(git.listedHeads).toStrictEqual([headCommit]);
  });

  it('reports the block’s entries as the merge block, keeping them out of the body', async () => {
    const { cwd, git, headCommit, home } = await makePullRequestRepo(['agents|feat: Add the parser']);
    const block = renderChangeRecordBlock({
      entries: [
        { breaking: false, scopes: ['agents', 'kb'], text: 'Adds the store-qualified wikilink', type: 'feat' },
        { breaking: true, scopes: ['agents'], text: 'Removes the legacy API', type: 'drop' },
      ],
      entriesCommit: headCommit.slice(0, 8),
      title: 'Add the parser',
    });
    const bodyFile = await writeBody(`## What\n\n- Adds the parser.\n\n${block}\n`);

    const { output } = await runDescribe({
      argv: ['resolve-merge', '--base', 'base', '--head', headCommit, ...pullRequestFlags(bodyFile)],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ body: '- Adds the parser.', entry_count: 2 });
    expect(output).toHaveProperty('merge_block', expect.stringMatching(/^```change-record\npr_number: 470\n/));
  });

  it('when the body does not contain a block, resolves from the commits and says so', async () => {
    const { cwd, git, headCommit, home } = await makePullRequestRepo(['agents|feat: Add the parser']);
    const bodyFile = await writeBody('## What\n\n- Adds the parser.\n');

    const { output } = await runDescribe({
      argv: ['resolve-merge', '--base', 'base', '--head', headCommit, ...pullRequestFlags(bodyFile)],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({
      effective_sources: { scope: 'commits', type: 'commits' },
      notices: [{ kind: 'absent-block' }],
      sources: { block: null },
    });
  });

  it('when the head commit is absent from the repository, resolves without the commits and says so', async () => {
    const { cwd, git, home } = await makePullRequestRepo(['agents|feat: Add the parser']);
    const absent = '0123456789abcdef0123456789abcdef01234567';
    const bodyFile = await writeBody('## What\n\n- Adds the parser.\n');

    const { output } = await runDescribe({
      argv: ['resolve-merge', '--base', 'base', '--head', absent, ...pullRequestFlags(bodyFile)],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({
      notices: [{ kind: 'absent-block' }, { kind: 'commits-unavailable' }],
      sources: { commits: null },
    });
  });

  it('when commit.title_format is empty, resolves without the commits rather than refusing', async () => {
    const { cwd, git, headCommit, home } = await makePullRequestRepo(['agents|feat: Add the parser']);
    await writeAgentsPreferences(
      cwd,
      [
        "commit:\n  title_format: ''",
        "pr:\n  title_format: '[{ticket_ref} ]{title}'",
        "merge:\n  title_format: '[{ticket_ref} ][[{scope}|]{type}: ]{title}[ (#{pr_number})]'",
      ].join('\n'),
    );
    const bodyFile = await writeBody('## What\n\n- Adds the parser.\n');

    const { output } = await runDescribe({
      argv: ['resolve-merge', '--base', 'base', '--head', headCommit, ...pullRequestFlags(bodyFile)],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({
      notices: [
        { kind: 'absent-block' },
        { kind: 'commits-unavailable', reason: expect.stringContaining('commit.title_format is empty') },
      ],
    });
  });

  it('refuses a body file that cannot be read', async () => {
    const { cwd, git, headCommit, home } = await makePullRequestRepo([]);

    await expect(
      runDescribe({
        argv: ['resolve-merge', '--base', 'base', '--head', headCommit, ...pullRequestFlags(join(cwd, 'absent.md'))],
        cwd,
        git,
        dataDir: DATA_DIR,
        home,
      }),
    ).rejects.toThrow(/--pr-body-file .*absent\.md cannot be read/);
  });

  it('refuses when the data directory does not contain a readable taxonomy', async () => {
    const { cwd, git, headCommit, home } = await makePullRequestRepo([]);
    const dataDir = await mkdtemp(join(tmpdir(), 'describe-change-data-'));
    const bodyFile = await writeBody('## What\n\n- Adds the parser.\n');

    await expect(
      runDescribe({
        argv: ['resolve-merge', '--base', 'base', '--head', headCommit, ...pullRequestFlags(bodyFile)],
        cwd,
        git,
        dataDir,
        home,
      }),
    ).rejects.toThrow(/resolve-merge checks types against the taxonomy/);
  });
});
