import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { parseArgs, runDescribe } from '../cli.ts';

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

// region | Helpers

/** Creates a temp home directory holding `.agents/preferences.yaml` with `content`. */
async function makeHome(content: string): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'describe-change-home-'));
  await writeAgentsPreferences(home, content);
  return home;
}

/** Creates a throwaway repository carrying `content` as its project preferences, plus an empty global home. */
async function makeRepo(content: string): Promise<{ cwd: string; home: string }> {
  const cwd = await mkdtemp(join(tmpdir(), 'describe-change-repo-'));
  await execFileAsync('git', ['-C', cwd, 'init', '--quiet']);
  await writeAgentsPreferences(cwd, content);
  const home = await mkdtemp(join(tmpdir(), 'describe-change-home-'));
  return { cwd, home };
}

/** Writes `content` to `.agents/preferences.yaml` under `root`. */
async function writeAgentsPreferences(root: string, content: string): Promise<void> {
  await mkdir(join(root, '.agents'), { recursive: true });
  await writeFile(join(root, '.agents', 'preferences.yaml'), `${content}\n`, 'utf8');
}

// endregion | Helpers
