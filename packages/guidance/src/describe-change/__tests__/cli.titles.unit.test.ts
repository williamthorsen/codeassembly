import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderChangeRecordBlock } from '../change-record-block.ts';
import { runDescribe } from '../cli.ts';
import { parseArgs } from '../parse-args.ts';
import {
  DATA_DIR,
  DEFECTIVE_TEMPLATES,
  HOUSE_TEMPLATES,
  makeRepo,
  writeAgentsPreferences,
} from '../test-utils/cli-fixtures.ts';
import { makeFakeGit } from '../test-utils/make-fake-git.ts';

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

  it('passes a marker spelled on the type through to the record', () => {
    expect(parseArgs(['render-titles', '--type', 'feat!'])).toEqual({
      record: { type: 'feat!' },
      subcommand: 'render-titles',
    });
  });

  it('yields an empty record for an invocation without flags', () => {
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
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

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
      git,
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

  it('reports the four keys with empty values for an invocation without flags', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({ argv: ['render-titles'], cwd, git, dataDir: DATA_DIR, home });

    expect(output).toEqual({ commit_title: '', ticket_title: '', pr_title: '', merge_title: '' });
  });

  it('anchors the lookup at the repository root rather than the invoking directory', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const nested = join(cwd, 'packages', 'agents');
    await mkdir(nested, { recursive: true });

    const { output } = await runDescribe({
      argv: ['render-titles', '--scope', 'agents', '--type', 'feat', '--title', 'Add foo'],
      cwd: nested,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ commit_title: 'agents|feat: Add foo' });
  });

  it('renders the marker for --breaking', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['render-titles', '--breaking', '--scope', 'agents', '--type', 'feat', '--title', 'Add foo'],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ commit_title: 'agents|feat!: Add foo' });
  });

  it('splits a marker spelled on the type', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['render-titles', '--scope', 'agents', '--type', 'feat!', '--title', 'Add foo'],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ commit_title: 'agents|feat!: Add foo' });
  });

  it('clears the wildcard scope', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['render-titles', '--scope', '*', '--type', 'feat', '--title', 'Add foo'],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ commit_title: 'feat: Add foo' });
  });

  it('warns of a configured template whose render drops the type with an absent scope, and still renders', async () => {
    const { cwd, git, home } = await makeRepo("commit:\n  title_format: '[{scope}|{type}: ]{title}'");

    const { output, warnings } = await runDescribe({
      argv: ['render-titles', '--scope', '*', '--type', 'feat', '--title', 'Add foo'],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ commit_title: 'Add foo' });
    expect(warnings).toContain(
      'commit.title_format: Template "[{scope}|{type}: ]{title}" renders a record without {scope} as "Add foo", which reads back as unmatched.',
    );
  });

  it('does not warn of the house templates', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

    const { warnings } = await runDescribe({ argv: ['render-titles'], cwd, git, dataDir: DATA_DIR, home });

    expect(warnings).toStrictEqual([]);
  });

  it('stops the run on a template that the engine cannot round-trip, naming the surface and the defect', async () => {
    const { cwd, git, home } = await makeRepo(DEFECTIVE_TEMPLATES);

    await expect(runDescribe({ argv: ['render-titles'], cwd, git, dataDir: DATA_DIR, home })).rejects.toThrow(
      /commit\.title_format: Template .* places \{scope\} and \{type\} without a literal between them/,
    );
  });

  it('warns rather than failing outside a repository', async () => {
    const home = await makeHome(HOUSE_TEMPLATES);
    const cwd = await mkdtemp(join(tmpdir(), 'describe-change-loose-'));
    const git = makeFakeGit();

    const { output, warnings } = await runDescribe({
      argv: ['render-titles', '--scope', 'agents', '--type', 'feat', '--title', 'Add foo'],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ commit_title: 'agents|feat: Add foo' });
    expect(warnings).toEqual([expect.stringContaining('git could not resolve the repository root')]);
  });

  it('warns and skips verification when the data directory does not contain a readable taxonomy', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const dataDir = await mkdtemp(join(tmpdir(), 'describe-change-data-'));

    const { output, warnings } = await runDescribe({
      argv: ['render-titles', '--title', 'Add foo'],
      cwd,
      git,
      dataDir,
      home,
    });

    expect(output).toMatchObject({ ticket_title: 'Add foo' });
    expect(warnings).toEqual([expect.stringContaining('work-types.json is missing or unreadable')]);
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

  it('rejects a surface that does not have a title template', () => {
    expect(() => parseArgs(['parse-title', 'branch', 'Add foo'])).toThrow(/parse-title must name one of/);
  });

  it('rejects a record flag', () => {
    expect(() => parseArgs(['parse-title', 'commit', 'Add foo', '--title', 'Add bar'])).toThrow(
      'unknown flag: --title',
    );
  });

  it('rejects an invocation without a subject', () => {
    expect(() => parseArgs(['parse-title', 'commit'])).toThrow(/takes the surface and the subject string/);
  });

  it('rejects a positional after the subject', () => {
    expect(() => parseArgs(['parse-title', 'commit', 'Add foo', 'Add bar'])).toThrow('unexpected argument: Add bar');
  });

  it('reads a rendered subject back into a record', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['parse-title', 'merge', '#466 agents|feat!: Add foo (#470)'],
      cwd,
      git,
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

  it('reports a subject as unmatched when the template does not match it', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['parse-title', 'merge', 'not a rendered merge subject'],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toEqual({ matched: false });
  });

  it('refuses to read back a surface whose template is empty', async () => {
    const { cwd, git, home } = await makeRepo("commit:\n  title_format: ''");

    await expect(
      runDescribe({ argv: ['parse-title', 'commit', 'Add foo'], cwd, git, dataDir: DATA_DIR, home }),
    ).rejects.toThrow(/commit\.title_format is empty/);
  });

  it('resolves the type through the embedded taxonomy when the invocation does not name a data directory', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

    const { output } = await runDescribe({ argv: ['parse-title', 'commit', 'agents|tests: Add foo'], cwd, git, home });

    expect(output).toMatchObject({ matched: true, scope: 'agents', type: 'tests' });
  });

  it('refuses when the data directory does not contain a readable taxonomy', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const dataDir = await mkdtemp(join(tmpdir(), 'describe-change-data-'));

    await expect(
      runDescribe({ argv: ['parse-title', 'commit', 'agents|feat: Add foo'], cwd, git, dataDir, home }),
    ).rejects.toThrow(/parse-title resolves the type against the taxonomy/);
  });
});

describe('render-block', () => {
  it('reads the title and every override flag', () => {
    const parsed = parseArgs([
      'render-block',
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
        overrides: { breaking: true, scope: 'kb', type: 'sec' },
        title: 'Add the parser',
      },
      subcommand: 'render-block',
    });
  });

  it.each(['--ticket-ref', '--pr-number', '--ticket-label', '--override-title', '--base', '--scope', '--type'])(
    'if %s is passed, refuses it as unknown',
    (flag) => {
      expect(() => parseArgs(['render-block', flag, 'value'])).toThrow(`unknown flag: ${flag}`);
    },
  );

  it('if --breaking is passed, refuses it as unknown', () => {
    expect(() => parseArgs(['render-block', '--title', 'Add foo', '--breaking'])).toThrow('unknown flag: --breaking');
  });

  it('reads an invocation with only the title', () => {
    expect(parseArgs(['render-block', '--title', 'Add foo'])).toEqual({
      block: { overrides: {}, title: 'Add foo' },
      subcommand: 'render-block',
    });
  });

  it.each([
    ['is missing', ['--override-type', 'feat']],
    ['is blank', ['--title', ' ', '--override-type', 'feat']],
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

  it('renders the block from the title and the overrides as the JSON output’s block', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const argv = ['render-block', '--title', 'Add the parser'];

    const { output } = await runDescribe({
      argv: [...argv, '--override-type', 'sec', '--override-breaking'],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toStrictEqual({
      block: renderChangeRecordBlock({
        overrides: { breaking: true, type: 'sec' },
        title: 'Add the parser',
      }),
    });
  });

  it('succeeds when a configured title template is defective', async () => {
    const { cwd, git, home } = await makeRepo(DEFECTIVE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['render-block', '--title', 'Add the parser'],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toStrictEqual({ block: renderChangeRecordBlock({ title: 'Add the parser' }) });
  });
});

// region | Helpers

/** Creates a temp home directory containing `.agents/preferences.yaml` with `content`. */
async function makeHome(content: string): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'describe-change-home-'));
  await writeAgentsPreferences(home, content);
  return home;
}

// endregion | Helpers
