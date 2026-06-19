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
async function makeRepoWithRemote(remoteUrl: string, remoteName = 'origin'): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), 'capture-cli-repo-'));
  await execFileAsync('git', ['-C', repo, 'init', '--quiet']);
  await execFileAsync('git', ['-C', repo, 'remote', 'add', remoteName, remoteUrl]);
  return repo;
}

const NOW = new Date('2026-06-04T06:57:22.000Z');

const EVENT_SCHEMA = `recordTypes:
  event:
    recall: recurrence-recency
    required: [id, captured-at, session, cwd, summary]
    optional: [repo, skill, model, harness, tags, correction, owner, locality, severity]
`;

function bodyStream(body: string): Readable {
  return Readable.from([Buffer.from(body, 'utf8')]);
}

/** Create a temp event store directory carrying a `recordTypes:` schema, returning its path. */
async function makeStoreDir(): Promise<string> {
  const storePath = await mkdtemp(join(tmpdir(), 'capture-cli-store-'));
  await mkdir(join(storePath, '.kb'), { recursive: true });
  await writeFile(join(storePath, '.kb', 'schema.yaml'), EVENT_SCHEMA, 'utf8');
  return storePath;
}

/** Stand up a temp event store plus an isolated home that registers it under `name` and marks it `default_kb`. */
async function makeStore(name: string): Promise<{ storePath: string; home: string }> {
  const storePath = await makeStoreDir();

  const home = await mkdtemp(join(tmpdir(), 'capture-cli-home-'));
  await mkdir(join(home, '.agents'), { recursive: true });
  await writeFile(
    join(home, '.agents', 'kb.yaml'),
    `default_kb: ${name}\nkbs:\n  ${name}:\n    path: ${storePath}\n`,
    'utf8',
  );

  return { storePath, home };
}

describe(parseArgs, () => {
  it('parses every value-bearing flag in long form', () => {
    const parsed = parseArgs([
      '--store',
      'codeassembly',
      '--summary',
      'A summary',
      '--skill',
      'kb-retrieve',
      '--model',
      'claude-opus-4-8',
      '--harness',
      'claude',
      '--tags',
      'one, two,three',
    ]);

    expect(parsed).toEqual({
      store: 'codeassembly',
      summary: 'A summary',
      skill: 'kb-retrieve',
      model: 'claude-opus-4-8',
      harness: 'claude',
      tags: ['one', 'two', 'three'],
    });
  });

  it('leaves the store null and optional flags null or empty when omitted', () => {
    const parsed = parseArgs(['--summary', 'Noticed']);

    expect(parsed.store).toBeNull();
    expect(parsed.skill).toBeNull();
    expect(parsed.model).toBeNull();
    expect(parsed.harness).toBeNull();
    expect(parsed.tags).toEqual([]);
  });

  it('throws when --summary is missing', () => {
    expect(() => parseArgs(['--store', 'codeassembly'])).toThrow(/--summary is required/);
  });

  it('rejects the retired --type flag as unknown', () => {
    expect(() => parseArgs(['--type', 'observation', '--summary', 'x'])).toThrow(/unknown flag/);
  });

  it('rejects the retired --correction flag as unknown', () => {
    expect(() => parseArgs(['--correction', 'Do it differently', '--summary', 'x'])).toThrow(/unknown flag/);
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

  it('returns undefined for a single-segment URL with no owner/name pair', () => {
    expect(normalizeRemoteUrl('https://github.com/onlyone.git')).toBeUndefined();
  });

  it('returns undefined for an unparseable URL', () => {
    expect(normalizeRemoteUrl('not-a-url')).toBeUndefined();
  });
});

describe(runCapture, () => {
  it('writes recordType: event and returns a ULID id and second-precision capturedAt', async () => {
    const { home } = await makeStore('codeassembly');
    const repo = await makeRepoWithRemote('git@github.com:williamthorsen/codeassembly.git');

    const result = await runCapture({
      argv: ['--store', '@default', '--summary', 'Noticed a thing'],
      stdin: bodyStream('Body text.'),
      cwd: repo,
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(result.capturedAt).toBe('2026-06-04T06:57:22Z');
      expect(result.store).toBe('codeassembly');
      const written = await readFile(result.path, 'utf8');
      expect(written).toMatch(/^recordType: event$/m);
      expect(written).not.toMatch(/^type:/m);
      expect(written).toContain('summary: Noticed a thing');
      expect(written).toContain('session: session-xyz');
      expect(written).toContain('repo: williamthorsen/codeassembly');
      expect(written).not.toMatch(/^harness:/m);
    }
  });

  it('writes the harness field when --harness is supplied', async () => {
    const { home } = await makeStore('codeassembly');
    const repo = await makeRepoWithRemote('git@github.com:williamthorsen/codeassembly.git');

    const result = await runCapture({
      argv: ['--store', '@default', '--summary', 'Noticed a thing', '--harness', 'claude'],
      stdin: bodyStream('Body text.'),
      cwd: repo,
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const written = await readFile(result.path, 'utf8');
      expect(written).toMatch(/^harness: claude$/m);
    }
  });

  it('resolves repo via the first-remote fallback when origin is absent', async () => {
    const { home } = await makeStore('codeassembly');
    const repo = await makeRepoWithRemote('git@github.com:williamthorsen/codeassembly.git', 'upstream');

    const result = await runCapture({
      argv: ['--store', '@default', '--summary', 'Noticed a thing'],
      stdin: bodyStream('Body text.'),
      cwd: repo,
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const written = await readFile(result.path, 'utf8');
      expect(written).toContain('repo: williamthorsen/codeassembly');
    }
  });

  it('writes an event with repo absent when cwd has no git remote', async () => {
    const { home } = await makeStore('codeassembly');
    const bareDir = await mkdtemp(join(tmpdir(), 'capture-cli-norepo-'));

    const result = await runCapture({
      argv: ['--store', '@default', '--summary', 'Noticed a thing'],
      stdin: bodyStream('Body text.'),
      cwd: bareDir,
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const written = await readFile(result.path, 'utf8');
      expect(written).not.toMatch(/^repo:/m);
    }
  });

  it('writes to the registered store, not a .kb in cwd, when capturing from a directory holding one', async () => {
    const { storePath, home } = await makeStore('codeassembly');
    const cwdWithKb = await mkdtemp(join(tmpdir(), 'capture-cli-cwdkb-'));
    await mkdir(join(cwdWithKb, '.kb'), { recursive: true });
    await writeFile(join(cwdWithKb, '.kb', 'schema.yaml'), EVENT_SCHEMA, 'utf8');

    const result = await runCapture({
      argv: ['--store', 'codeassembly', '--summary', 'Noticed a thing'],
      stdin: bodyStream('Body text.'),
      cwd: cwdWithKb,
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path.startsWith(storePath)).toBe(true);
      const cwdEntries = await readdir(cwdWithKb);
      expect(cwdEntries).not.toContain('content');
    }
  });

  it('fails when the named store is not registered', async () => {
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-empty-'));

    const result = await runCapture({
      argv: ['--store', 'missing', '--summary', 'x'],
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

  it('writes to the --store override, not the configured default_kb', async () => {
    const defaultStore = await makeStoreDir();
    const namedStore = await makeStoreDir();
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-twostore-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(
      join(home, '.agents', 'kb.yaml'),
      `default_kb: fallback\nkbs:\n  fallback:\n    path: ${defaultStore}\n  named:\n    path: ${namedStore}\n`,
      'utf8',
    );

    const result = await runCapture({
      argv: ['--store', 'named', '--summary', 'Noticed a thing'],
      stdin: bodyStream('Body text.'),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.store).toBe('named');
      expect(result.path.startsWith(namedStore)).toBe(true);
    }
  });

  it('fails with missing-store, listing the non-default store and marking the registry default', async () => {
    const defaultStore = await makeStoreDir();
    const otherStore = await makeStoreDir();
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-missingstore-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(
      join(home, '.agents', 'kb.yaml'),
      `default_kb: primary\nkbs:\n  primary:\n    path: ${defaultStore}\n  secondary:\n    path: ${otherStore}\n`,
      'utf8',
    );

    const result = await runCapture({
      argv: ['--summary', 'x'],
      stdin: bodyStream(''),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('missing-store');
      expect(result.message).toContain('secondary');
      expect(result.message).toContain('default is "primary"');
      expect(result.message).toContain('--store @default');
    }
  });

  it('fails with no-default-store when --store @default is given but no default_kb is configured', async () => {
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-nodefault-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(join(home, '.agents', 'kb.yaml'), 'kbs:\n  codeassembly:\n    path: /tmp/whatever\n', 'utf8');

    const result = await runCapture({
      argv: ['--store', '@default', '--summary', 'x'],
      stdin: bodyStream(''),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('no-default-store');
    }
  });

  it('names the registry-load cause when --store names a registered store but default_kb is unresolvable', async () => {
    const storePath = await makeStoreDir();
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-poisoned-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(
      join(home, '.agents', 'kb.yaml'),
      `default_kb: ghost\nkbs:\n  realstore:\n    path: ${storePath}\n`,
      'utf8',
    );

    const result = await runCapture({
      argv: ['--store', 'realstore', '--summary', 'x'],
      stdin: bodyStream(''),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('store-not-registered');
      expect(result.message).toMatch(/default_kb "ghost" does not match any registered KB/);
    }
  });

  it('returns invalid-args when a required flag is missing', async () => {
    const { home } = await makeStore('codeassembly');

    const result = await runCapture({
      argv: ['--store', 'codeassembly'],
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
