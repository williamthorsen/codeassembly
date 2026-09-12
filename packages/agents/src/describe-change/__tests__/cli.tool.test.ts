import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { renderChangeRecordBlock } from '../change-record-block.ts';
import { parseArgs, runDescribe } from '../cli.ts';
import type { ClassifiedEntryOutcome, ClassifyOutcome } from '../types.ts';

const execFileAsync = promisify(execFile);

/** The taxonomy the installed helper reads, so the suite verifies against the types the repository actually declares. */
const DATA_DIR = fileURLToPath(new URL('../../../content/skills/_data', import.meta.url));

const HOUSE_TEMPLATES = [
  "commit:\n  title_format: '[{scope}|{type}: ]{title}'",
  "ticket:\n  title_format: '{title}'",
  "pr:\n  title_format: '[{ticket_ref} ]{title}'",
  "merge:\n  title_format: '[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]'",
].join('\n');

describe(parseArgs, () => {
  it('reads every record flag', () => {
    const parsed = parseArgs([
      '--scope',
      'agents',
      '--type',
      'feat',
      '--title',
      'Add foo',
      '--ticket-ref',
      '#466',
      '--pr-number',
      '470',
    ]);

    expect(parsed).toEqual({
      mode: 'render',
      record: { prNumber: '470', scope: 'agents', ticketRef: '#466', title: 'Add foo', type: 'feat' },
    });
  });

  it('reads --breaking', () => {
    expect(parseArgs(['--breaking', '--type', 'feat'])).toEqual({
      mode: 'render',
      record: { breaking: true, type: 'feat' },
    });
  });

  it('carries a marker spelled on the type through to the record', () => {
    expect(parseArgs(['--type', 'feat!'])).toEqual({ mode: 'render', record: { type: 'feat!' } });
  });

  it('yields an empty record for an invocation with no flags', () => {
    expect(parseArgs([])).toEqual({ mode: 'render', record: {} });
  });

  it('reads --parse with its surface and subject', () => {
    expect(parseArgs(['--parse', 'commit', 'agents|feat: Add foo'])).toEqual({
      mode: 'parse',
      subject: 'agents|feat: Add foo',
      surface: 'commit',
    });
  });

  it('rejects an unknown flag', () => {
    expect(() => parseArgs(['--titel', 'Add foo'])).toThrow(/unknown flag/);
  });

  it('rejects a surface --parse does not name', () => {
    expect(() => parseArgs(['--parse', 'branch', 'Add foo'])).toThrow(/--parse must name one of/);
  });

  it('rejects a record flag alongside --parse', () => {
    expect(() => parseArgs(['--parse', 'commit', 'Add foo', '--title', 'Add bar'])).toThrow(/takes no record flags/);
  });

  it('rejects --parse with no subject', () => {
    expect(() => parseArgs(['--parse', 'commit'])).toThrow(/takes the surface and the subject string/);
  });

  it('rejects a stray positional', () => {
    expect(() => parseArgs(['Add foo'])).toThrow(/unexpected argument/);
  });
});

describe(runDescribe, () => {
  it('renders all four surfaces from the resolved templates', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['--scope', 'agents', '--type', 'feat', '--title', 'Add foo', '--ticket-ref', '#466', '--pr-number', '470'],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toEqual({
      commit_title: 'agents|feat: Add foo',
      ticket_title: 'Add foo',
      pr_title: '#466 Add foo',
      merge_title: '#466 agents|feat: Add foo (#470)',
    });
  });

  it('reports the four keys with empty values for an invocation with no arguments', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({ argv: [], cwd, dataDir: DATA_DIR, home });

    expect(output).toEqual({ commit_title: '', ticket_title: '', pr_title: '', merge_title: '' });
  });

  it('anchors the lookup at the repository root rather than the invoking directory', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);
    const nested = join(cwd, 'packages', 'agents');
    await mkdir(nested, { recursive: true });

    const { output } = await runDescribe({
      argv: ['--scope', 'agents', '--type', 'feat', '--title', 'Add foo'],
      cwd: nested,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ commit_title: 'agents|feat: Add foo' });
  });

  it('renders the marker for --breaking', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['--breaking', '--scope', 'agents', '--type', 'feat', '--title', 'Add foo'],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ commit_title: 'agents|feat!: Add foo' });
  });

  it('splits a marker spelled on the type', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['--scope', 'agents', '--type', 'feat!', '--title', 'Add foo'],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ commit_title: 'agents|feat!: Add foo' });
  });

  it('normalizes the wildcard scope to no scope', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['--scope', '*', '--type', 'feat', '--title', 'Add foo'],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ commit_title: 'Add foo' });
  });

  it('reads a rendered subject back into a record', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['--parse', 'merge', '#466 agents|feat!: Add foo (#470)'],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toEqual({
      breaking: true,
      matched: true,
      pr_number: '470',
      scope: 'agents',
      ticket_ref: '#466',
      title: 'Add foo',
      type: 'feat',
    });
  });

  it('reports a subject the template does not match as unmatched', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['--parse', 'merge', 'not a rendered merge subject'],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toEqual({ matched: false });
  });

  it('refuses to read back a surface whose template is empty', async () => {
    const { cwd, home } = await makeRepo("commit:\n  title_format: ''");

    await expect(runDescribe({ argv: ['--parse', 'commit', 'Add foo'], cwd, dataDir: DATA_DIR, home })).rejects.toThrow(
      /commit\.title_format is empty/,
    );
  });

  it('stops the run on a template the engine cannot round-trip, naming the surface and the defect', async () => {
    const { cwd, home } = await makeRepo("commit:\n  title_format: '{scope}{type}: {title}'");

    await expect(runDescribe({ argv: [], cwd, dataDir: DATA_DIR, home })).rejects.toThrow(
      /commit\.title_format: Template .* places \{scope\} and \{type\} with no literal between them/,
    );
  });

  it('warns rather than failing outside a repository', async () => {
    const home = await makeHome(HOUSE_TEMPLATES);
    const cwd = await mkdtemp(join(tmpdir(), 'describe-change-loose-'));

    const { output, warnings } = await runDescribe({
      argv: ['--scope', 'agents', '--type', 'feat', '--title', 'Add foo'],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ commit_title: 'agents|feat: Add foo' });
    expect(warnings).toEqual([expect.stringContaining('git could not resolve the repository root')]);
  });

  it('warns and skips verification when no taxonomy is readable', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);
    const dataDir = await mkdtemp(join(tmpdir(), 'describe-change-data-'));

    const { output, warnings } = await runDescribe({ argv: ['--title', 'Add foo'], cwd, dataDir, home });

    expect(output).toMatchObject({ ticket_title: 'Add foo' });
    expect(warnings).toEqual([expect.stringContaining('no readable work-types.json')]);
  });

  it('refuses --parse when no taxonomy is readable', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);
    const dataDir = await mkdtemp(join(tmpdir(), 'describe-change-data-'));

    await expect(
      runDescribe({ argv: ['--parse', 'commit', 'agents|feat: Add foo'], cwd, dataDir, home }),
    ).rejects.toThrow(/--parse resolves the type against the taxonomy/);
  });
});

describe('--classify', () => {
  it('reads the base ref and every ticket label', () => {
    const parsed = parseArgs(['--classify', 'main', '--ticket-label', 'feature', '--ticket-label', 'scope:agents']);

    expect(parsed).toEqual({ baseRef: 'main', mode: 'classify', ticketLabels: ['feature', 'scope:agents'] });
  });

  it('reads an invocation carrying no ticket label', () => {
    expect(parseArgs(['--classify', 'main'])).toEqual({ baseRef: 'main', mode: 'classify', ticketLabels: [] });
  });

  it('refuses a record flag alongside it', () => {
    expect(() => parseArgs(['--classify', 'main', '--title', 'Add foo'])).toThrow(/takes no record flags; got --title/);
  });

  it('refuses --parse alongside it', () => {
    expect(() => parseArgs(['--classify', 'main', '--parse', 'commit'])).toThrow(/each select a mode/);
  });

  it('refuses --ticket-label on its own', () => {
    expect(() => parseArgs(['--ticket-label', 'feature'])).toThrow(/takes no meaning on its own/);
  });

  it('lets one feat speak for a branch carrying three fixes', async () => {
    const { cwd, home } = await makeCommittedRepo([
      'agents|fix: Correct the guard',
      'agents|feat: Add the parser',
      'agents|fix: Correct the other guard',
      'agents|fix: Correct the third guard',
    ]);

    const { output } = await runDescribe({ argv: ['--classify', 'base'], cwd, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ head: { breaking: false, scope: 'agents', type: 'feat' } });
  });

  it('carries the breaking marker onto the head', async () => {
    const { cwd, home } = await makeCommittedRepo(['agents|sec!: Patch the parser', 'agents|fix: Correct the guard']);

    const { output } = await runDescribe({ argv: ['--classify', 'base'], cwd, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ head: { breaking: true, scope: 'agents', type: 'sec' } });
  });

  it('lists an unmatched subject and keeps it out of the entries', async () => {
    const { cwd, home } = await makeCommittedRepo(['agents|feat: Add the parser', 'wip']);

    const { output } = await runDescribe({ argv: ['--classify', 'base'], cwd, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({
      entries: [{ scope: 'agents', type: 'feat' }],
      unclassified: [{ subject: 'wip' }],
    });
  });

  it('reports a fix carrying the marker its policy forbids', async () => {
    const { cwd, home } = await makeCommittedRepo(['agents|fix!: Correct the guard']);

    const { output } = await runDescribe({ argv: ['--classify', 'base'], cwd, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ violations: [{ policy: 'forbidden', type: 'fix' }] });
  });

  it('yields a null head for a range holding no commits', async () => {
    const { cwd, home } = await makeCommittedRepo([]);

    const { output } = await runDescribe({ argv: ['--classify', 'base'], cwd, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ entries: [], head: null, ticket_type: null, unclassified: [], violations: [] });
  });

  it('resolves the ticket type from the labels and the repository’s label map', async () => {
    const { cwd, home } = await makeCommittedRepo(['agents|feat: Add the parser']);
    await mkdir(join(cwd, '.meta'), { recursive: true });
    await writeFile(join(cwd, '.meta', 'label-map.json'), JSON.stringify({ types: { feat: 'feature', fix: 'fix' } }));

    const argv = ['--classify', 'base', '--ticket-label', 'fix', '--ticket-label', 'scope:agents'];
    const { output } = await runDescribe({ argv, cwd, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ head: { type: 'feat' }, ticket_type: 'fix' });
  });

  it('yields a null ticket type where the repository configures no label map', async () => {
    const { cwd, home } = await makeCommittedRepo(['agents|feat: Add the parser']);

    const argv = ['--classify', 'base', '--ticket-label', 'feature'];
    const { output } = await runDescribe({ argv, cwd, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ ticket_type: null });
  });

  it('takes a commit’s Change trailers in place of its subject', async () => {
    const { cwd, home } = await makeCommittedRepo([
      [
        'agents|fix: Squash the branch',
        '',
        'Change: agents|feat: Add the parser',
        'Change: agents|fix: Correct the guard',
      ].join('\n'),
    ]);

    const { output } = await runDescribe({ argv: ['--classify', 'base'], cwd, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({
      entries: [{ type: 'feat' }, { type: 'fix' }],
      head: { scope: 'agents', type: 'feat' },
    });
  });

  it('when a subject carries a ticket reference, renders its change without it', async () => {
    const { cwd, home } = await makeCommittedRepo(['#466 agents|feat!: Add the parser']);

    const { output } = await runDescribe({ argv: ['--classify', 'base'], cwd, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ entries: [{ change: 'agents|feat!: Add the parser' }] });
  });

  it('when each entry’s change is written as a Change trailer, classifies back to the same entries', async () => {
    const original = await classifyMessages([
      'agents|feat!: Add the parser, the renderer, and the verifier',
      '#466 agents|fix: Correct the guard',
      'kb|docs: Describe the store',
    ]);
    const trailers = original.entries.map((entry) => `Change: ${entry.change}`);

    const condensed = await classifyMessages([
      ['agents|feat!: Condense the branch', '', 'Adds the parser.', '', ...trailers].join('\n'),
    ]);

    expect(condensed.entries.map(omitCommit)).toStrictEqual(original.entries.map(omitCommit));
  });

  it('refuses --classify when no taxonomy is readable', async () => {
    const { cwd, home } = await makeCommittedRepo(['agents|feat: Add the parser']);
    const dataDir = await mkdtemp(join(tmpdir(), 'describe-change-data-'));

    await expect(runDescribe({ argv: ['--classify', 'base'], cwd, dataDir, home })).rejects.toThrow(
      /--classify ranks types against the taxonomy/,
    );
  });
});

describe('--record-block', () => {
  it('reads the head’s record flags and every override flag', () => {
    const parsed = parseArgs([
      '--record-block',
      '--scope',
      'agents',
      '--type',
      'feat',
      '--breaking',
      '--title',
      'Add the parser',
      '--override-scope',
      'kb',
      '--override-type',
      'sec',
      '--override-breaking',
    ]);

    expect(parsed).toEqual({
      block: {
        head: { breaking: true, scope: 'agents', title: 'Add the parser', type: 'feat' },
        overrides: { breaking: true, scope: 'kb', type: 'sec' },
      },
      mode: 'record-block',
    });
  });

  it.each(['--ticket-ref', '--pr-number', '--ticket-label'])(
    'if %s is passed alongside it, refuses the flag',
    (flag) => {
      expect(() => parseArgs(['--record-block', flag, 'value'])).toThrow(/takes no --/);
    },
  );

  it('selects the mode from the valueless flag alone', () => {
    expect(parseArgs(['--record-block'])).toEqual({ block: { head: {}, overrides: {} }, mode: 'record-block' });
  });

  it('if a value is passed inline, refuses it', () => {
    expect(() => parseArgs(['--record-block=e5029924'])).toThrow(/does not take a value/);
  });

  it('if --classify is passed alongside it, refuses the invocation', () => {
    expect(() => parseArgs(['--record-block', '--classify', 'main'])).toThrow(/each select a mode/);
  });

  it('if an override flag is passed without it, refuses the flag', () => {
    expect(() => parseArgs(['--title', 'Add foo', '--override-type', 'feat'])).toThrow(/takes no meaning on its own/);
  });

  it('renders the block from the head and the overrides as the JSON output’s block', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);
    const argv = ['--record-block', '--scope', 'agents', '--type', 'feat', '--title', 'Add the parser'];

    const { output } = await runDescribe({
      argv: [...argv, '--override-type', 'sec', '--override-breaking'],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toStrictEqual({
      block: renderChangeRecordBlock({
        head: { scope: 'agents', title: 'Add the parser', type: 'feat' },
        overrides: { breaking: true, type: 'sec' },
      }),
    });
  });
});

describe('--resolve-merge', () => {
  const REQUIRED = [
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
      '--resolve-merge',
      'origin/main',
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
      mode: 'resolve-merge',
    });
  });

  it.each(['--head', '--pr-title', '--pr-body-file', '--pr-number'])(
    'if %s is missing, refuses the invocation',
    (flag) => {
      const index = REQUIRED.indexOf(flag);
      const argv = ['--resolve-merge', 'origin/main', ...REQUIRED.toSpliced(index, 2)];

      expect(() => parseArgs(argv)).toThrow(`--resolve-merge requires ${flag}`);
    },
  );

  it.each(['--scope', '--type', '--title'])(
    'if the record flag %s is passed alongside it, refuses the flag',
    (flag) => {
      expect(() => parseArgs(['--resolve-merge', 'origin/main', ...REQUIRED, flag, 'value'])).toThrow(
        /reads the head from the pull request, so it takes no --/,
      );
    },
  );

  it('if both breaking overrides are passed, refuses the invocation', () => {
    const argv = ['--resolve-merge', 'origin/main', ...REQUIRED, '--override-breaking', '--no-override-breaking'];

    expect(() => parseArgs(argv)).toThrow(/opposite directions/);
  });

  it('if the type override spells the marker, refuses it', () => {
    const argv = ['--resolve-merge', 'origin/main', ...REQUIRED, '--override-type', 'feat!'];

    expect(() => parseArgs(argv)).toThrow(/takes a bare type; pass --override-breaking/);
  });

  it('if the pull-request number is not digits, refuses it', () => {
    const argv = ['--resolve-merge', 'origin/main', ...REQUIRED.slice(0, -1), '#470'];

    expect(() => parseArgs(argv)).toThrow(/--pr-number takes the pull request’s number/);
  });

  it.each(['--override-title', '--pr-label'])('if %s is passed without it, refuses the flag', (flag) => {
    expect(() => parseArgs(['--title', 'Add foo', flag, 'value'])).toThrow(/is an input to --resolve-merge/);
  });

  it('if --override-title is passed alongside --record-block, refuses the flag', () => {
    expect(() => parseArgs(['--record-block', '--override-title', 'Add foo'])).toThrow(/takes no --/);
  });

  it('resolves a merge end to end from a body file, reading the commits to a head that the checkout is not on', async () => {
    const { cwd, headCommit, home } = await makePullRequestRepo([
      'agents|feat: Add the parser',
      'agents|fix: Correct the guard',
    ]);
    await mkdir(join(cwd, '.meta'), { recursive: true });
    await writeFile(join(cwd, '.meta', 'label-map.json'), JSON.stringify({ types: { docs: 'documentation' } }));
    const block = renderChangeRecordBlock({ head: { scope: 'agents', title: 'Add the parser', type: 'feat' } });
    const bodyFile = await writeBody(`## What\n\n- Adds the parser.\n\nCloses #466\n\n${block}\n`);

    const { output } = await runDescribe({
      argv: [
        '--resolve-merge',
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
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toStrictEqual({
      head: { breaking: false, scope: 'agents', type: 'feat' },
      recorded: { breaking: false, scope: 'agents', type: 'feat' },
      derived: { breaking: false, scope: 'agents', type: 'feat' },
      labeled: null,
      title: 'Add the parser',
      ticket_ref: '#466',
      merge_title: '#466 agents|feat: Add the parser (#470)',
      body: '- Adds the parser.',
      defects: [],
      notices: [],
    });
  });

  it('where the head commit is absent from the repository, resolves without a derivation and says so', async () => {
    const { cwd, home } = await makePullRequestRepo(['agents|feat: Add the parser']);
    const absent = '0123456789abcdef0123456789abcdef01234567';
    const bodyFile = await writeBody('## What\n\n- Adds the parser.\n');

    const { output } = await runDescribe({
      argv: ['--resolve-merge', 'base', '--head', absent, ...pullRequestFlags(bodyFile)],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ derived: null, notices: [{ kind: 'derivation-unavailable' }] });
  });

  it('where commit.title_format is empty, resolves without a derivation rather than refusing', async () => {
    const { cwd, headCommit, home } = await makePullRequestRepo(['agents|feat: Add the parser']);
    await writeAgentsPreferences(
      cwd,
      [
        "commit:\n  title_format: ''",
        "pr:\n  title_format: '[{ticket_ref} ]{title}'",
        "merge:\n  title_format: '[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]'",
      ].join('\n'),
    );
    const bodyFile = await writeBody('## What\n\n- Adds the parser.\n');

    const { output } = await runDescribe({
      argv: ['--resolve-merge', 'base', '--head', headCommit, ...pullRequestFlags(bodyFile)],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({
      notices: [{ kind: 'derivation-unavailable', reason: expect.stringContaining('commit.title_format is empty') }],
    });
  });

  it('refuses a body file that cannot be read', async () => {
    const { cwd, headCommit, home } = await makePullRequestRepo([]);

    await expect(
      runDescribe({
        argv: ['--resolve-merge', 'base', '--head', headCommit, ...pullRequestFlags(join(cwd, 'absent.md'))],
        cwd,
        dataDir: DATA_DIR,
        home,
      }),
    ).rejects.toThrow(/--pr-body-file .*absent\.md cannot be read/);
  });

  it('refuses when no taxonomy is readable', async () => {
    const { cwd, headCommit, home } = await makePullRequestRepo([]);
    const dataDir = await mkdtemp(join(tmpdir(), 'describe-change-data-'));
    const bodyFile = await writeBody('## What\n\n- Adds the parser.\n');

    await expect(
      runDescribe({
        argv: ['--resolve-merge', 'base', '--head', headCommit, ...pullRequestFlags(bodyFile)],
        cwd,
        dataDir,
        home,
      }),
    ).rejects.toThrow(/--resolve-merge checks types against the taxonomy/);
  });
});

// region | Helpers

/** Classifies a throwaway repository holding one commit per message, returning the `--classify` output. */
async function classifyMessages(messages: readonly string[]): Promise<ClassifyOutcome> {
  const { cwd, home } = await makeCommittedRepo(messages);
  const { output } = await runDescribe({ argv: ['--classify', 'base'], cwd, dataDir: DATA_DIR, home });
  if (!('entries' in output)) {
    throw new Error(`--classify did not report entries: ${JSON.stringify(output)}`);
  }
  return output;
}

/** Drops the commit hash from an entry, which differs between two repositories holding the same entries. */
function omitCommit(entry: ClassifiedEntryOutcome): Omit<ClassifiedEntryOutcome, 'commit'> {
  const { commit: _commit, ...rest } = entry;
  return rest;
}

/** Creates a temp home directory holding `.agents/preferences.yaml` with `content`. */
async function makeHome(content: string): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'describe-change-home-'));
  await writeAgentsPreferences(home, content);
  return home;
}

/**
 * Creates a throwaway repository carrying the house templates, one commit per message, and a `base` tag before the
 * first of them, so `--classify base` reads exactly the messages given.
 */
async function makeCommittedRepo(messages: readonly string[]): Promise<{ cwd: string; home: string }> {
  const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);
  await execFileAsync('git', ['-C', cwd, 'config', 'user.email', 'test@example.com']);
  await execFileAsync('git', ['-C', cwd, 'config', 'user.name', 'Test']);

  await writeFile(join(cwd, 'seed.txt'), 'seed\n', 'utf8');
  await commitAll(cwd, 'seed');
  await execFileAsync('git', ['-C', cwd, 'tag', 'base']);

  for (const [index, message] of messages.entries()) {
    await writeFile(join(cwd, `file${index}.txt`), `${index}\n`, 'utf8');
    await commitAll(cwd, message);
  }
  return { cwd, home };
}

/** Stages everything in `cwd` and records it under `message`, bypassing the hooks and signing a fixture cannot supply. */
async function commitAll(cwd: string, message: string): Promise<void> {
  await execFileAsync('git', ['-C', cwd, 'add', '--all']);
  await execFileAsync('git', ['-C', cwd, 'commit', '--message', message, '--no-gpg-sign', '--no-verify', '--quiet']);
}

/**
 * Creates a throwaway repository whose pull-request branch holds one commit per message on top of `base`, and returns
 * to the default branch, so the branch's head commit is not the checkout's `HEAD`.
 */
async function makePullRequestRepo(
  messages: readonly string[],
): Promise<{ cwd: string; headCommit: string; home: string }> {
  const { cwd, home } = await makeCommittedRepo([]);
  await execFileAsync('git', ['-C', cwd, 'checkout', '--quiet', '-b', 'pull-request']);
  for (const [index, message] of messages.entries()) {
    await writeFile(join(cwd, `branch${index}.txt`), `${index}\n`, 'utf8');
    await commitAll(cwd, message);
  }
  const { stdout } = await execFileAsync('git', ['-C', cwd, 'rev-parse', 'pull-request']);
  await execFileAsync('git', ['-C', cwd, 'checkout', '--quiet', '-']);
  return { cwd, headCommit: stdout.trim(), home };
}

/** Creates a throwaway repository carrying `content` as its project preferences, plus an empty global home. */
async function makeRepo(content: string): Promise<{ cwd: string; home: string }> {
  const cwd = await mkdtemp(join(tmpdir(), 'describe-change-repo-'));
  await execFileAsync('git', ['-C', cwd, 'init', '--quiet']);
  await writeAgentsPreferences(cwd, content);
  const home = await mkdtemp(join(tmpdir(), 'describe-change-home-'));
  return { cwd, home };
}

/** Returns the pull-request flags that `--resolve-merge` requires beside `--head`, reading the body from `bodyFile`. */
function pullRequestFlags(bodyFile: string): string[] {
  return ['--pr-title', '#466 Add the parser', '--pr-body-file', bodyFile, '--pr-number', '470'];
}

/** Writes `content` to a pull-request body file under a scratch directory and returns its path. */
async function writeBody(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'describe-change-body-'));
  const bodyFile = join(dir, 'body.md');
  await writeFile(bodyFile, content, 'utf8');
  return bodyFile;
}

/** Writes `content` to `.agents/preferences.yaml` under `root`. */
async function writeAgentsPreferences(root: string, content: string): Promise<void> {
  await mkdir(join(root, '.agents'), { recursive: true });
  await writeFile(join(root, '.agents', 'preferences.yaml'), `${content}\n`, 'utf8');
}

// endregion | Helpers
