import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { normalizeRemoteUrl, parseArgs, runCapture } from '../cli.ts';

const execFileAsync = promisify(execFile);

/** Initialize a throwaway git repo with a single named remote, so `resolveRepo` can derive an `owner/name`. */
async function makeRepoWithRemote(remoteUrl: string): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), 'capture-cli-repo-'));
  await execFileAsync('git', ['-C', repo, 'init', '--quiet']);
  await execFileAsync('git', ['-C', repo, 'remote', 'add', 'origin', remoteUrl]);
  return repo;
}

const NOW = new Date('2026-06-04T06:57:22.000Z');

const KIND_AWARE_SCHEMA = `kinds:
  event:
    immutable: true
    recall: recurrence-recency
    required: [id, type, captured-at, session, cwd, repo, summary]
    optional: [skill, model, tags, owner, locality, severity]
    types:
      observation: {}
      mistake:
        required: [correction]
`;

function bodyStream(body: string): Readable {
  return Readable.from([Buffer.from(body, 'utf8')]);
}

/** Stand up a temp event store with a kind-aware schema plus an isolated home registering it under `name`. */
async function makeStore(name: string): Promise<{ storePath: string; home: string }> {
  const storePath = await mkdtemp(join(tmpdir(), 'capture-cli-store-'));
  await mkdir(join(storePath, '.kb'), { recursive: true });
  await writeFile(join(storePath, '.kb', 'schema.yaml'), KIND_AWARE_SCHEMA, 'utf8');

  const home = await mkdtemp(join(tmpdir(), 'capture-cli-home-'));
  await mkdir(join(home, '.agents'), { recursive: true });
  await writeFile(join(home, '.agents', 'kb.yaml'), `kbs:\n  ${name}:\n    path: ${storePath}\n`, 'utf8');

  return { storePath, home };
}

describe(parseArgs, () => {
  it('parses every value-bearing flag in long form', () => {
    const parsed = parseArgs([
      '--store',
      'codeassembly',
      '--type',
      'mistake',
      '--summary',
      'A summary',
      '--skill',
      'kb-retrieve',
      '--model',
      'claude-opus-4-8',
      '--tags',
      'one, two,three',
      '--correction',
      'Do it differently',
    ]);

    expect(parsed).toEqual({
      store: 'codeassembly',
      type: 'mistake',
      summary: 'A summary',
      skill: 'kb-retrieve',
      model: 'claude-opus-4-8',
      tags: ['one', 'two', 'three'],
      correction: 'Do it differently',
    });
  });

  it('defaults the store to codeassembly and optional flags to null or empty', () => {
    const parsed = parseArgs(['--type', 'observation', '--summary', 'Noticed']);

    expect(parsed.store).toBe('codeassembly');
    expect(parsed.skill).toBeNull();
    expect(parsed.model).toBeNull();
    expect(parsed.tags).toEqual([]);
    expect(parsed.correction).toBeNull();
  });

  it('throws when --type is missing', () => {
    expect(() => parseArgs(['--summary', 'x'])).toThrow(/--type is required/);
  });

  it('throws when --summary is missing', () => {
    expect(() => parseArgs(['--type', 'observation'])).toThrow(/--summary is required/);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['--bogus', 'x'])).toThrow(/unknown flag/);
  });
});

describe(normalizeRemoteUrl, () => {
  it('normalizes an SSH remote to owner/name', () => {
    expect(normalizeRemoteUrl('git@github.com:williamthorsen/codeassembly.git')).toBe('williamthorsen/codeassembly');
  });

  it('normalizes an HTTPS remote to owner/name', () => {
    expect(normalizeRemoteUrl('https://github.com/williamthorsen/codeassembly.git')).toBe(
      'williamthorsen/codeassembly',
    );
  });

  it('strips a missing .git suffix gracefully', () => {
    expect(normalizeRemoteUrl('https://github.com/williamthorsen/codeassembly')).toBe('williamthorsen/codeassembly');
  });

  it('reduces a nested path to its last two segments', () => {
    expect(normalizeRemoteUrl('https://gitlab.com/group/subgroup/project.git')).toBe('subgroup/project');
  });

  it('returns undefined for an unparseable URL', () => {
    expect(normalizeRemoteUrl('not-a-url')).toBeUndefined();
  });
});

describe(runCapture, () => {
  it('writes an observation event and returns a ULID id and ISO capturedAt', async () => {
    const { home } = await makeStore('codeassembly');
    const repo = await makeRepoWithRemote('git@github.com:williamthorsen/codeassembly.git');

    const result = await runCapture({
      argv: ['--type', 'observation', '--summary', 'Noticed a thing'],
      stdin: bodyStream('Body text.'),
      cwd: repo,
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(result.capturedAt).toBe('2026-06-04T06:57:22.000Z');
      expect(result.store).toBe('codeassembly');
      const written = await readFile(result.path, 'utf8');
      expect(written).toContain('type: observation');
      expect(written).toContain('summary: Noticed a thing');
      expect(written).toContain('session: session-xyz');
      expect(written).toContain('repo: williamthorsen/codeassembly');
    }
  });

  it('refuses a mistake event with no correction and writes nothing', async () => {
    const { storePath, home } = await makeStore('codeassembly');

    const result = await runCapture({
      argv: ['--type', 'mistake', '--summary', 'A mistake'],
      stdin: bodyStream(''),
      cwd: '/tmp/elsewhere',
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('schema-validation');
      expect(result.findings?.map((finding) => finding.message)).toContain('missing required field: correction');
    }
    const entries = await readdir(storePath);
    expect(entries).not.toContain('events');
  });

  it('fails when the named store is not registered', async () => {
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-empty-'));

    const result = await runCapture({
      argv: ['--store', 'missing', '--type', 'observation', '--summary', 'x'],
      stdin: bodyStream(''),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('store-not-registered');
    }
  });

  it('returns invalid-args when a required flag is missing', async () => {
    const { home } = await makeStore('codeassembly');

    const result = await runCapture({
      argv: ['--type', 'observation'],
      stdin: bodyStream(''),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-args');
    }
  });
});
