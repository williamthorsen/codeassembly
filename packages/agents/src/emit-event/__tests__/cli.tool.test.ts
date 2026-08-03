import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isRecord } from '../../lib/type-guards.ts';
import { parseArgs, runEmit } from '../cli.ts';
import type { EmitResult } from '../types.ts';

const execFileAsync = promisify(execFile);

const NOW = new Date('2026-07-14T14:10:46.123Z');

const REMOTE_URL = 'git@github.com:williamthorsen/codeassembly.git';

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** An environment supplying a session id, as a Claude session invokes the helper. */
const ENV_WITH_SESSION: NodeJS.ProcessEnv = { CLAUDE_CODE_SESSION_ID: 'env-session' };

describe(parseArgs, () => {
  it('parses every flag in its separate-token form', () => {
    expect(
      parseArgs([
        '--type',
        'skill.started',
        '--payload',
        '{"skill":"plan"}',
        '--session',
        's1',
        '--harness',
        'claude',
        '--home',
        '/tmp/home',
      ]),
    ).toEqual({
      type: 'skill.started',
      payload: '{"skill":"plan"}',
      session: 's1',
      harness: 'claude',
      home: '/tmp/home',
    });
  });

  it('parses the inline --flag=value form', () => {
    expect(parseArgs(['--type=skill.started', '--payload={"a":1}'])).toEqual({
      type: 'skill.started',
      payload: '{"a":1}',
      session: null,
      harness: null,
      home: null,
    });
  });

  it('defaults every optional flag to null', () => {
    expect(parseArgs(['--type', 'pr.created'])).toEqual({
      type: 'pr.created',
      payload: null,
      session: null,
      harness: null,
      home: null,
    });
  });

  it('throws when --type is missing', () => {
    expect(() => parseArgs(['--payload', '{}'])).toThrow(/--type is required/);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['--type', 'skill.started', '--mystery', 'x'])).toThrow(/unknown flag/);
  });

  it('throws on an unexpected positional', () => {
    expect(() => parseArgs(['skill.started'])).toThrow(/unexpected argument/);
  });

  it('throws on an empty value', () => {
    expect(() => parseArgs(['--type='])).toThrow(/--type requires a value/);
  });
});

describe(runEmit, () => {
  let home: string;
  let stderr: ReturnType<typeof spyOnStderr>;

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), 'emit-event-home-'));
    stderr = spyOnStderr();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(home, { recursive: true, force: true });
  });

  it('appends a full envelope and reports where it landed', async () => {
    const cwd = await makeRepo({ branch: 'MAC-42/feat/thing', remote: REMOTE_URL });

    const result = await runEmit({
      argv: ['--type', 'skill.started', '--payload', '{"skill":"plan"}', '--harness', 'claude', '--home', home],
      cwd,
      env: ENV_WITH_SESSION,
      now: NOW,
    });

    expect(result).toEqual({
      ok: true,
      id: expect.stringMatching(ULID_PATTERN),
      path: eventPath(home, 'williamthorsen', 'codeassembly', 'MAC-42-feat-thing', 'env-session'),
    });
    expect(await readEvents(result)).toEqual([
      {
        id: expect.stringMatching(ULID_PATTERN),
        ts: '2026-07-14T14:10:46.123Z',
        type: 'skill.started',
        repo: 'williamthorsen/codeassembly',
        branch: 'MAC-42/feat/thing',
        session: 'env-session',
        cwd,
        harness: 'claude',
        payload: { skill: 'plan' },
      },
    ]);
  });

  it('defaults the payload to an empty object', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });

    const result = await runEmit({ argv: ['--type', 'skill.completed', '--home', home], cwd, env: {}, now: NOW });

    const [envelope] = await readEvents(result);
    expect(envelope?.payload).toEqual({});
  });

  it('lets --session override the environment-derived session', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });

    const result = await runEmit({
      argv: ['--type', 'skill.started', '--session', 'relayed-session', '--home', home],
      cwd,
      env: ENV_WITH_SESSION,
      now: NOW,
    });

    expect(result).toMatchObject({
      ok: true,
      path: eventPath(home, 'williamthorsen', 'codeassembly', 'main', 'relayed-session'),
    });
    const [envelope] = await readEvents(result);
    expect(envelope?.session).toBe('relayed-session');
  });

  it('files the event under the repo placeholder when no remote resolves', async () => {
    const cwd = await makeRepo({ branch: 'main' });

    const result = await runEmit({
      argv: ['--type', 'skill.started', '--home', home],
      cwd,
      env: ENV_WITH_SESSION,
      now: NOW,
    });

    expect(result).toMatchObject({
      ok: true,
      path: eventPath(home, '_no-repo', '_no-repo', 'main', 'env-session'),
    });
    const [envelope] = await readEvents(result);
    expect(envelope).not.toHaveProperty('repo');
    expect(envelope?.branch).toBe('main');
  });

  it('files the event under the branch placeholder on a detached HEAD', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL, detach: true });

    const result = await runEmit({
      argv: ['--type', 'skill.started', '--home', home],
      cwd,
      env: ENV_WITH_SESSION,
      now: NOW,
    });

    expect(result).toMatchObject({
      ok: true,
      path: eventPath(home, 'williamthorsen', 'codeassembly', '_no-branch', 'env-session'),
    });
    const [envelope] = await readEvents(result);
    expect(envelope).not.toHaveProperty('branch');
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/HEAD is detached/));
  });

  it('files the event under the session placeholder when the harness exposes no session id', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });

    const result = await runEmit({ argv: ['--type', 'skill.started', '--home', home], cwd, env: {}, now: NOW });

    expect(result).toMatchObject({
      ok: true,
      path: eventPath(home, 'williamthorsen', 'codeassembly', 'main', '_no-session'),
    });
    const [envelope] = await readEvents(result);
    expect(envelope).not.toHaveProperty('session');
  });

  it('falls back to every placeholder outside a git repository', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'emit-event-bare-'));

    const result = await runEmit({ argv: ['--type', 'skill.started', '--home', home], cwd, env: {}, now: NOW });

    expect(result).toMatchObject({
      ok: true,
      path: eventPath(home, '_no-repo', '_no-repo', '_no-branch', '_no-session'),
    });

    await rm(cwd, { recursive: true, force: true });
  });

  it('warns on an undeclared type but appends the event anyway', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });

    const result = await runEmit({ argv: ['--type', 'skill.invented', '--home', home], cwd, env: {}, now: NOW });

    expect(result).toMatchObject({ ok: true });
    const [envelope] = await readEvents(result);
    expect(envelope?.type).toBe('skill.invented');
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/unknown event type "skill\.invented"/));
  });

  it('appends to an existing session log rather than truncating it', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });

    await runEmit({ argv: ['--type', 'skill.started', '--home', home], cwd, env: ENV_WITH_SESSION, now: NOW });
    const second = await runEmit({
      argv: ['--type', 'skill.completed', '--home', home],
      cwd,
      env: ENV_WITH_SESSION,
      now: NOW,
    });

    const envelopes = await readEvents(second);
    expect(envelopes.map((envelope) => envelope.type)).toEqual(['skill.started', 'skill.completed']);
  });

  it('reports invalid args without writing anything', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });

    const result = await runEmit({ argv: ['--payload', '{}', '--home', home], cwd, env: {}, now: NOW });

    expect(result).toEqual({ ok: false, error: 'invalid-args', message: expect.stringMatching(/--type is required/) });
    await expect(listEventsRoot(home)).resolves.toEqual([]);
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/--type is required/));
  });

  it('reports a payload that is not valid JSON without writing anything', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });

    const result = await runEmit({
      argv: ['--type', 'skill.started', '--payload', '{not json', '--home', home],
      cwd,
      env: {},
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid-payload' });
    await expect(listEventsRoot(home)).resolves.toEqual([]);
  });

  it('reports a payload that is valid JSON but not an object without writing anything', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });

    // A bare array or scalar is refused rather than wrapped: the payload's shape is the per-family contract consumers
    // read, so a silently reshaped payload would be worse than a refused event the caller is told about.
    const result = await runEmit({
      argv: ['--type', 'skill.started', '--payload', '["a"]', '--home', home],
      cwd,
      env: {},
      now: NOW,
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'invalid-payload',
      message: expect.stringMatching(/must be a JSON object/),
    });
    await expect(listEventsRoot(home)).resolves.toEqual([]);
  });

  it('reports a failed write rather than throwing', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });
    // A regular file where the events root needs a directory: the recursive `mkdir` cannot succeed, which is the
    // cheapest reproduction of an unwritable events root.
    const blockedHome = path.join(home, 'blocked');
    await writeFile(blockedHome, 'not a directory', 'utf8');

    const result = await runEmit({ argv: ['--type', 'skill.started', '--home', blockedHome], cwd, env: {}, now: NOW });

    expect(result).toMatchObject({ ok: false, error: 'write-failed' });
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/could not append the event/));
  });
});

// region | Helpers

/** Builds the path the helper should write to, under the test's isolated `home`. */
function eventPath(home: string, owner: string, name: string, branch: string, session: string): string {
  return path.join(home, '.codeassembly', 'events', owner, name, branch, `${session}.jsonl`);
}

/** Lists the events root under `home`, treating an absent root as empty — the state a refused emission leaves it in. */
async function listEventsRoot(home: string): Promise<string[]> {
  try {
    return await readdir(path.join(home, '.codeassembly'));
  } catch {
    return [];
  }
}

/**
 * Stands up a throwaway git repo on `branch`, optionally with an `origin` remote and a detached HEAD. Detaching needs a
 * commit to detach onto, so that variant seeds an empty one.
 */
async function makeRepo(input: { branch: string; remote?: string; detach?: boolean }): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), 'emit-event-repo-'));
  await execFileAsync('git', ['-C', repo, 'init', '--quiet', `--initial-branch=${input.branch}`]);
  if (input.remote !== undefined) {
    await execFileAsync('git', ['-C', repo, 'remote', 'add', 'origin', input.remote]);
  }
  if (input.detach === true) {
    await execFileAsync('git', [
      '-C',
      repo,
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test',
      'commit',
      '--quiet',
      '--allow-empty',
      '--message',
      'seed',
    ]);
    await execFileAsync('git', ['-C', repo, 'checkout', '--quiet', '--detach']);
  }
  return repo;
}

/**
 * Reads back every envelope appended to the log the result names, as raw records. Throws when the emission did not
 * succeed. The envelopes stay `unknown`-valued rather than typed as `EventEnvelope`: these assertions exist to prove
 * what actually reached the file, so re-imposing the producer's type on the bytes it wrote would beg the question.
 */
async function readEvents(result: EmitResult): Promise<Record<string, unknown>[]> {
  if (!result.ok) {
    throw new Error(`expected a successful emission, got ${JSON.stringify(result)}`);
  }
  const content = await readFile(result.path, 'utf8');
  return content
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const envelope: unknown = JSON.parse(line);
      if (!isRecord(envelope)) {
        throw new Error(`expected a JSON object per line, got: ${line}`);
      }
      return envelope;
    });
}

/** Silences the helper's stderr diagnostics and captures them for assertion. */
function spyOnStderr() {
  return vi.spyOn(process.stderr, 'write').mockReturnValue(true);
}

// endregion | Helpers
