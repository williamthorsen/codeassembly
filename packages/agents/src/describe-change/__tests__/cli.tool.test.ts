import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { isRecord } from '../../lib/type-guards.ts';
import { renderChangeRecordBlock } from '../change-record-block.ts';
import { parseArgs, runDescribe } from '../cli.ts';
import type { ClassifiedEntryOutcome, ConsolidateBranchOutcome } from '../types.ts';

const execFileAsync = promisify(execFile);

/** The helper's source, which the running Node executes directly. */
const CLI_PATH = fileURLToPath(new URL('../cli.ts', import.meta.url));

/** The `consolidate-branch` invocation that reads the range from the fixture repository's `base` tag. */
const CONSOLIDATE_BASE = ['consolidate-branch', '--base', 'base'];

/** The taxonomy the installed helper reads, so the suite verifies against the types the repository actually declares. */
const DATA_DIR = fileURLToPath(new URL('../../../content/skills/_data', import.meta.url));

/** A commit template that the engine cannot round-trip, since nothing separates the scope from the type. */
const DEFECTIVE_TEMPLATES = "commit:\n  title_format: '{scope}{type}: {title}'";

const HOUSE_TEMPLATES = [
  "commit:\n  title_format: '[{scope}|{type}: ]{title}'",
  "ticket:\n  title_format: '{title}'",
  "pr:\n  title_format: '[{ticket_ref} ]{title}'",
  "merge:\n  title_format: '[{ticket_ref} ][{scope}|{type}: ]{title}[ (#{pr_number})]'",
].join('\n');

const SUBCOMMAND_NAMES = [
  'render-titles',
  'parse-title',
  'consolidate-branch',
  'resolve-ticket-type',
  'render-block',
  'resolve-merge',
];

describe('subcommand dispatch', () => {
  it('if no subcommand is passed, refuses with a usage error listing every subcommand', () => {
    expect(() => parseArgs([])).toThrow(
      `a subcommand is required; usage: describe-change <subcommand> [flags], where <subcommand> is one of ${SUBCOMMAND_NAMES.join(', ')}`,
    );
  });

  it('if a flag is passed in place of a subcommand, refuses it as unknown', () => {
    expect(() => parseArgs(['--classify', 'main'])).toThrow(/^unknown subcommand --classify; usage: /);
  });

  it('if no subcommand is passed, exits non-zero and lists every subcommand on stderr', async () => {
    const result = await runCli([]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    for (const name of SUBCOMMAND_NAMES) {
      expect(result.stderr).toContain(name);
    }
  });

  it('if an unknown subcommand is passed, exits non-zero and lists every subcommand on stderr', async () => {
    const result = await runCli(['--scope', 'agents']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/^describe-change: unknown subcommand --scope; usage: /);
    for (const name of SUBCOMMAND_NAMES) {
      expect(result.stderr).toContain(name);
    }
  });

  it('matches a subcommand only in the first position', () => {
    expect(() => parseArgs(['--title', 'Add foo', 'render-titles'])).toThrow(/unknown subcommand --title/);
  });
});

describe('render-titles', () => {
  it('reads every record flag', () => {
    const parsed = parseArgs([
      'render-titles',
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
      record: { prNumber: '470', scope: 'agents', ticketRef: '#466', title: 'Add foo', type: 'feat' },
      subcommand: 'render-titles',
    });
  });

  it('reads --breaking', () => {
    expect(parseArgs(['render-titles', '--breaking', '--type', 'feat'])).toEqual({
      record: { breaking: true, type: 'feat' },
      subcommand: 'render-titles',
    });
  });

  it('carries a marker spelled on the type through to the record', () => {
    expect(parseArgs(['render-titles', '--type', 'feat!'])).toEqual({
      record: { type: 'feat!' },
      subcommand: 'render-titles',
    });
  });

  it('yields an empty record for an invocation with no flags', () => {
    expect(parseArgs(['render-titles'])).toEqual({ record: {}, subcommand: 'render-titles' });
  });

  it('rejects an unknown flag', () => {
    expect(() => parseArgs(['render-titles', '--titel', 'Add foo'])).toThrow(/unknown flag/);
  });

  it('rejects a stray positional', () => {
    expect(() => parseArgs(['render-titles', 'Add foo'])).toThrow(/unexpected argument/);
  });

  it.each(['--ticket-label', '--override-type', '--override-title', '--pr-label', '--base'])(
    'if %s, which only another subcommand takes, is passed, refuses it as unknown',
    (flag) => {
      expect(() => parseArgs(['render-titles', '--title', 'Add foo', flag, 'value'])).toThrow(`unknown flag: ${flag}`);
    },
  );

  it('renders all four surfaces from the resolved templates', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: [
        'render-titles',
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
      ],
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

  it('reports the four keys with empty values for an invocation with no flags', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({ argv: ['render-titles'], cwd, dataDir: DATA_DIR, home });

    expect(output).toEqual({ commit_title: '', ticket_title: '', pr_title: '', merge_title: '' });
  });

  it('anchors the lookup at the repository root rather than the invoking directory', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);
    const nested = join(cwd, 'packages', 'agents');
    await mkdir(nested, { recursive: true });

    const { output } = await runDescribe({
      argv: ['render-titles', '--scope', 'agents', '--type', 'feat', '--title', 'Add foo'],
      cwd: nested,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ commit_title: 'agents|feat: Add foo' });
  });

  it('renders the marker for --breaking', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['render-titles', '--breaking', '--scope', 'agents', '--type', 'feat', '--title', 'Add foo'],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ commit_title: 'agents|feat!: Add foo' });
  });

  it('splits a marker spelled on the type', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['render-titles', '--scope', 'agents', '--type', 'feat!', '--title', 'Add foo'],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ commit_title: 'agents|feat!: Add foo' });
  });

  it('normalizes the wildcard scope to no scope', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['render-titles', '--scope', '*', '--type', 'feat', '--title', 'Add foo'],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ commit_title: 'Add foo' });
  });

  it('stops the run on a template the engine cannot round-trip, naming the surface and the defect', async () => {
    const { cwd, home } = await makeRepo(DEFECTIVE_TEMPLATES);

    await expect(runDescribe({ argv: ['render-titles'], cwd, dataDir: DATA_DIR, home })).rejects.toThrow(
      /commit\.title_format: Template .* places \{scope\} and \{type\} with no literal between them/,
    );
  });

  it('warns rather than failing outside a repository', async () => {
    const home = await makeHome(HOUSE_TEMPLATES);
    const cwd = await mkdtemp(join(tmpdir(), 'describe-change-loose-'));

    const { output, warnings } = await runDescribe({
      argv: ['render-titles', '--scope', 'agents', '--type', 'feat', '--title', 'Add foo'],
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

    const { output, warnings } = await runDescribe({
      argv: ['render-titles', '--title', 'Add foo'],
      cwd,
      dataDir,
      home,
    });

    expect(output).toMatchObject({ ticket_title: 'Add foo' });
    expect(warnings).toEqual([expect.stringContaining('no readable work-types.json')]);
  });
});

describe('parse-title', () => {
  it('reads the surface and the subject', () => {
    expect(parseArgs(['parse-title', 'commit', 'agents|feat: Add foo'])).toEqual({
      subcommand: 'parse-title',
      subject: 'agents|feat: Add foo',
      surface: 'commit',
    });
  });

  it('rejects a surface that no template is configured for', () => {
    expect(() => parseArgs(['parse-title', 'branch', 'Add foo'])).toThrow(/parse-title must name one of/);
  });

  it('rejects a record flag', () => {
    expect(() => parseArgs(['parse-title', 'commit', 'Add foo', '--title', 'Add bar'])).toThrow(
      'unknown flag: --title',
    );
  });

  it('rejects an invocation with no subject', () => {
    expect(() => parseArgs(['parse-title', 'commit'])).toThrow(/takes the surface and the subject string/);
  });

  it('rejects a positional after the subject', () => {
    expect(() => parseArgs(['parse-title', 'commit', 'Add foo', 'Add bar'])).toThrow('unexpected argument: Add bar');
  });

  it('reads a rendered subject back into a record', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['parse-title', 'merge', '#466 agents|feat!: Add foo (#470)'],
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
      argv: ['parse-title', 'merge', 'not a rendered merge subject'],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toEqual({ matched: false });
  });

  it('refuses to read back a surface whose template is empty', async () => {
    const { cwd, home } = await makeRepo("commit:\n  title_format: ''");

    await expect(
      runDescribe({ argv: ['parse-title', 'commit', 'Add foo'], cwd, dataDir: DATA_DIR, home }),
    ).rejects.toThrow(/commit\.title_format is empty/);
  });

  it('refuses when no taxonomy is readable', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);
    const dataDir = await mkdtemp(join(tmpdir(), 'describe-change-data-'));

    await expect(
      runDescribe({ argv: ['parse-title', 'commit', 'agents|feat: Add foo'], cwd, dataDir, home }),
    ).rejects.toThrow(/parse-title resolves the type against the taxonomy/);
  });
});

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

  it('lets one feat speak for a branch carrying three fixes', async () => {
    const { cwd, home } = await makeCommittedRepo([
      'agents|fix: Correct the guard',
      'agents|feat: Add the parser',
      'agents|fix: Correct the other guard',
      'agents|fix: Correct the third guard',
    ]);

    const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ head: { breaking: false, scope: 'agents', type: 'feat' } });
  });

  it('carries the breaking marker onto the head', async () => {
    const { cwd, home } = await makeCommittedRepo(['agents|sec!: Patch the parser', 'agents|fix: Correct the guard']);

    const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ head: { breaking: true, scope: 'agents', type: 'sec' } });
  });

  it('lists an unmatched subject and keeps it out of the entries', async () => {
    const { cwd, home } = await makeCommittedRepo(['agents|feat: Add the parser', 'wip']);

    const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({
      entries: [{ scope: 'agents', type: 'feat' }],
      unclassified: [{ subject: 'wip' }],
    });
  });

  it('reports a fix carrying the marker its policy forbids', async () => {
    const { cwd, home } = await makeCommittedRepo(['agents|fix!: Correct the guard']);

    const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ violations: [{ policy: 'forbidden', type: 'fix' }] });
  });

  it('yields a null head for a range holding no commits', async () => {
    const { cwd, home } = await makeCommittedRepo([]);

    const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ entries: [], head: null, unclassified: [], violations: [] });
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

    const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({
      entries: [{ type: 'feat' }, { type: 'fix' }],
      head: { scope: 'agents', type: 'feat' },
    });
  });

  it('when a subject carries a ticket reference, renders its change without it', async () => {
    const { cwd, home } = await makeCommittedRepo(['#466 agents|feat!: Add the parser']);

    const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, dataDir: DATA_DIR, home });

    expect(output).toMatchObject({ entries: [{ change: 'agents|feat!: Add the parser' }] });
  });

  it('when each entry’s change is written as a Change trailer, classifies back to the same entries', async () => {
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

  it('refuses when no taxonomy is readable', async () => {
    const { cwd, home } = await makeCommittedRepo(['agents|feat: Add the parser']);
    const dataDir = await mkdtemp(join(tmpdir(), 'describe-change-data-'));

    await expect(runDescribe({ argv: CONSOLIDATE_BASE, cwd, dataDir, home })).rejects.toThrow(
      /consolidate-branch ranks types against the taxonomy/,
    );
  });
});

describe('resolve-ticket-type', () => {
  it('reads every ticket label', () => {
    expect(parseArgs(['resolve-ticket-type', '--ticket-label', 'feature', '--ticket-label', 'scope:agents'])).toEqual({
      subcommand: 'resolve-ticket-type',
      ticketLabels: ['feature', 'scope:agents'],
    });
  });

  it('reads an invocation carrying no ticket label', () => {
    expect(parseArgs(['resolve-ticket-type'])).toEqual({ subcommand: 'resolve-ticket-type', ticketLabels: [] });
  });

  it('refuses --base, which consolidate-branch takes', () => {
    expect(() => parseArgs(['resolve-ticket-type', '--base', 'main'])).toThrow('unknown flag: --base');
  });

  it('resolves the ticket type from the labels and the repository’s label map', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);
    await writeLabelMap(cwd, { types: { feat: 'feature', fix: 'fix' } });

    const argv = ['resolve-ticket-type', '--ticket-label', 'fix', '--ticket-label', 'scope:agents'];
    const { output, warnings } = await runDescribe({ argv, cwd, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ ticket_type: 'fix' });
    expect(warnings).toStrictEqual([]);
  });

  it('reads the label map from the repository root rather than the invoking directory', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);
    await writeLabelMap(cwd, { types: { feat: 'feature' } });
    const nested = join(cwd, 'packages', 'agents');
    await mkdir(nested, { recursive: true });

    const argv = ['resolve-ticket-type', '--ticket-label', 'feature'];
    const { output } = await runDescribe({ argv, cwd: nested, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ ticket_type: 'feat' });
  });

  it('yields a null ticket type where the repository configures no label map', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);

    const argv = ['resolve-ticket-type', '--ticket-label', 'feature'];
    const { output } = await runDescribe({ argv, cwd, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ ticket_type: null });
  });

  it('succeeds where a configured title template is defective', async () => {
    const { cwd, home } = await makeRepo(DEFECTIVE_TEMPLATES);
    await writeLabelMap(cwd, { types: { feat: 'feature' } });

    const argv = ['resolve-ticket-type', '--ticket-label', 'feature'];
    const { output } = await runDescribe({ argv, cwd, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ ticket_type: 'feat' });
  });
});

describe('render-block', () => {
  it('reads the title, the consolidated record’s flags, and every override flag', () => {
    const parsed = parseArgs([
      'render-block',
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
        consolidatedRecord: { breaking: true, scope: 'agents', type: 'feat' },
        overrides: { breaking: true, scope: 'kb', type: 'sec' },
        title: 'Add the parser',
      },
      subcommand: 'render-block',
    });
  });

  it.each(['--ticket-ref', '--pr-number', '--ticket-label', '--override-title', '--base'])(
    'if %s is passed, refuses it as unknown',
    (flag) => {
      expect(() => parseArgs(['render-block', flag, 'value'])).toThrow(`unknown flag: ${flag}`);
    },
  );

  it('reads an invocation carrying only the title', () => {
    expect(parseArgs(['render-block', '--title', 'Add foo'])).toEqual({
      block: { consolidatedRecord: {}, overrides: {}, title: 'Add foo' },
      subcommand: 'render-block',
    });
  });

  it.each([
    ['is missing', ['--type', 'feat']],
    ['is blank', ['--title', ' ', '--type', 'feat']],
  ])('if --title %s, refuses the invocation', (_label, flags) => {
    expect(() => parseArgs(['render-block', ...flags])).toThrow('render-block requires --title');
  });

  it('if a value is passed inline to a valueless flag, refuses it', () => {
    expect(() => parseArgs(['render-block', '--title', 'Add foo', '--override-breaking=true'])).toThrow(
      /does not take a value/,
    );
  });

  it('if the type override spells the marker, refuses it', () => {
    expect(() => parseArgs(['render-block', '--title', 'Add foo', '--override-type', 'feat!'])).toThrow(
      '--override-type takes a bare type; pass --override-breaking for a breaking change',
    );
  });

  it('renders the block from the title, the consolidated record, and the overrides as the JSON output’s block', async () => {
    const { cwd, home } = await makeRepo(HOUSE_TEMPLATES);
    const argv = ['render-block', '--scope', 'agents', '--type', 'feat', '--title', 'Add the parser'];

    const { output } = await runDescribe({
      argv: [...argv, '--override-type', 'sec', '--override-breaking'],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toStrictEqual({
      block: renderChangeRecordBlock({
        consolidatedRecord: { scope: 'agents', type: 'feat' },
        overrides: { breaking: true, type: 'sec' },
        title: 'Add the parser',
      }),
    });
  });

  it('succeeds where a configured title template is defective', async () => {
    const { cwd, home } = await makeRepo(DEFECTIVE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['render-block', '--scope', 'agents', '--type', 'feat', '--title', 'Add the parser'],
      cwd,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toStrictEqual({
      block: renderChangeRecordBlock({
        consolidatedRecord: { scope: 'agents', type: 'feat' },
        title: 'Add the parser',
      }),
    });
  });
});

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

  it('resolves a merge end to end from a body file, reading the commits to a head that the checkout is not on', async () => {
    const { cwd, headCommit, home } = await makePullRequestRepo([
      'agents|feat: Add the parser',
      'agents|fix: Correct the guard',
    ]);
    await writeLabelMap(cwd, { types: { docs: 'documentation' } });
    const block = renderChangeRecordBlock({
      consolidatedRecord: { scope: 'agents', type: 'feat' },
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
      argv: ['resolve-merge', '--base', 'base', '--head', absent, ...pullRequestFlags(bodyFile)],
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
      argv: ['resolve-merge', '--base', 'base', '--head', headCommit, ...pullRequestFlags(bodyFile)],
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
        argv: ['resolve-merge', '--base', 'base', '--head', headCommit, ...pullRequestFlags(join(cwd, 'absent.md'))],
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
        argv: ['resolve-merge', '--base', 'base', '--head', headCommit, ...pullRequestFlags(bodyFile)],
        cwd,
        dataDir,
        home,
      }),
    ).rejects.toThrow(/resolve-merge checks types against the taxonomy/);
  });
});

// region | Helpers

/** A finished helper process: what it wrote and how it exited. */
interface CliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/** Stages everything in `cwd` and records it under `message`, bypassing the hooks and signing a fixture cannot supply. */
async function commitAll(cwd: string, message: string): Promise<void> {
  await execFileAsync('git', ['-C', cwd, 'add', '--all']);
  await execFileAsync('git', ['-C', cwd, 'commit', '--message', message, '--no-gpg-sign', '--no-verify', '--quiet']);
}

/** Consolidates a throwaway repository holding one commit per message, returning the `consolidate-branch` output. */
async function consolidateMessages(messages: readonly string[]): Promise<ConsolidateBranchOutcome> {
  const { cwd, home } = await makeCommittedRepo(messages);
  const { output } = await runDescribe({ argv: CONSOLIDATE_BASE, cwd, dataDir: DATA_DIR, home });
  if (!('entries' in output)) {
    throw new Error(`consolidate-branch did not report entries: ${JSON.stringify(output)}`);
  }
  return output;
}

/** Reports whether a thrown value is a failed child process carrying its output and exit code. */
function isExecError(error: unknown): error is { code: number; stderr: string; stdout: string } {
  return (
    isRecord(error) &&
    typeof error.code === 'number' &&
    typeof error.stderr === 'string' &&
    typeof error.stdout === 'string'
  );
}

/**
 * Creates a throwaway repository carrying the house templates, one commit per message, and a `base` tag before the
 * first of them, so `consolidate-branch --base base` reads exactly the messages given.
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

/** Creates a temp home directory holding `.agents/preferences.yaml` with `content`. */
async function makeHome(content: string): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'describe-change-home-'));
  await writeAgentsPreferences(home, content);
  return home;
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

/** Drops the commit hash from an entry, which differs between two repositories holding the same entries. */
function omitCommit(entry: ClassifiedEntryOutcome): Omit<ClassifiedEntryOutcome, 'commit'> {
  const { commit: _commit, ...rest } = entry;
  return rest;
}

/** Returns the pull-request flags that `resolve-merge` requires beside `--base` and `--head`, reading the body from `bodyFile`. */
function pullRequestFlags(bodyFile: string): string[] {
  return ['--pr-title', '#466 Add the parser', '--pr-body-file', bodyFile, '--pr-number', '470'];
}

/** Runs the helper's source under the running Node, capturing its output and exit code. */
async function runCli(argv: readonly string[]): Promise<CliResult> {
  try {
    const { stderr, stdout } = await execFileAsync(process.execPath, [CLI_PATH, ...argv]);
    return { exitCode: 0, stderr, stdout };
  } catch (error) {
    if (isExecError(error)) {
      return { exitCode: error.code, stderr: error.stderr, stdout: error.stdout };
    }
    throw error;
  }
}

/** Writes `content` to `.agents/preferences.yaml` under `root`. */
async function writeAgentsPreferences(root: string, content: string): Promise<void> {
  await mkdir(join(root, '.agents'), { recursive: true });
  await writeFile(join(root, '.agents', 'preferences.yaml'), `${content}\n`, 'utf8');
}

/** Writes `content` to a pull-request body file under a scratch directory and returns its path. */
async function writeBody(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'describe-change-body-'));
  const bodyFile = join(dir, 'body.md');
  await writeFile(bodyFile, content, 'utf8');
  return bodyFile;
}

/** Writes `labelMap` to the repository's `.meta/label-map.json`. */
async function writeLabelMap(root: string, labelMap: unknown): Promise<void> {
  await mkdir(join(root, '.meta'), { recursive: true });
  await writeFile(join(root, '.meta', 'label-map.json'), JSON.stringify(labelMap));
}

// endregion | Helpers
