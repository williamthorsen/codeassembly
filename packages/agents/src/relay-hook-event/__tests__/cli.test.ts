import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isRecord } from '../../lib/type-guards.ts';
import { parseArgs, parseHookPayload, runRelay } from '../cli.ts';
import type { RelayResult } from '../types.ts';

const execFileAsync = promisify(execFile);

const NOW = new Date('2026-07-16T09:30:00.000Z');

const REMOTE_URL = 'git@github.com:williamthorsen/codeassembly.git';

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** An environment supplying a session id, as a Claude session exposes to a hook it spawns. */
const ENV_WITH_SESSION: NodeJS.ProcessEnv = { CLAUDE_CODE_SESSION_ID: 'env-session' };

describe(parseArgs, () => {
  it('parses every flag in its separate-token form', () => {
    expect(parseArgs(['--harness', 'claude', '--hook', 'SessionStart', '--home', '/tmp/home'])).toEqual({
      harness: 'claude',
      hook: 'SessionStart',
      home: '/tmp/home',
    });
  });

  it('parses the inline --flag=value form', () => {
    expect(parseArgs(['--harness=rovodev', '--hook=on_complete'])).toEqual({
      harness: 'rovodev',
      hook: 'on_complete',
      home: null,
    });
  });

  it('throws when --harness is missing', () => {
    expect(() => parseArgs(['--hook', 'Stop'])).toThrow(/--harness is required/);
  });

  it('throws when --hook is missing', () => {
    expect(() => parseArgs(['--harness', 'claude'])).toThrow(/--hook is required/);
  });

  it('throws on a harness the relay does not serve', () => {
    expect(() => parseArgs(['--harness', 'codex', '--hook', 'Stop'])).toThrow(/--harness must be one of/);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['--harness', 'claude', '--hook', 'Stop', '--mystery', 'x'])).toThrow(/unknown flag/);
  });

  it('throws on an unexpected positional', () => {
    expect(() => parseArgs(['SessionStart'])).toThrow(/unexpected argument/);
  });

  it('throws on an empty value', () => {
    expect(() => parseArgs(['--harness=', '--hook=Stop'])).toThrow(/--harness requires a value/);
  });
});

describe(parseHookPayload, () => {
  const mapping = { type: 'session.started', discriminators: ['source'] } as const;

  it('reads the session and working directory both harnesses report', () => {
    const stdin = JSON.stringify({ session_id: 'abc', cwd: '/repos/thing', hook_event_name: 'SessionStart' });

    expect(parseHookPayload({ stdin, mapping })).toEqual({
      ok: true,
      value: { session: 'abc', cwd: '/repos/thing', discriminators: {} },
    });
  });

  it('carries through the mapping’s discriminator keys and nothing else', () => {
    // `user_input` is the field the relay must not carry: the turn boundary is the signal, not what was said.
    const stdin = JSON.stringify({ session_id: 'abc', source: 'resume', user_input: 'secret', reason: 'clear' });

    expect(parseHookPayload({ stdin, mapping })).toMatchObject({
      ok: true,
      value: { discriminators: { source: 'resume' } },
    });
  });

  it('preserves a nested discriminator object as the harness shaped it', () => {
    const stdin = JSON.stringify({ attributes: { reason: 'switch', forked: true } });

    expect(
      parseHookPayload({ stdin, mapping: { type: 'session.ended', discriminators: ['attributes'] } }),
    ).toMatchObject({ ok: true, value: { discriminators: { attributes: { reason: 'switch', forked: true } } } });
  });

  it('omits a session and cwd the payload does not carry', () => {
    expect(parseHookPayload({ stdin: '{}', mapping })).toEqual({ ok: true, value: { discriminators: {} } });
  });

  it('treats a non-string session as absent rather than stringifying it', () => {
    const stdin = JSON.stringify({ session_id: 42, cwd: '' });

    expect(parseHookPayload({ stdin, mapping })).toEqual({ ok: true, value: { discriminators: {} } });
  });

  it('refuses a payload that is not valid JSON', () => {
    expect(parseHookPayload({ stdin: '{not json', mapping })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/not valid JSON/),
    });
  });

  it('refuses a payload that is valid JSON but not an object', () => {
    expect(parseHookPayload({ stdin: '["a"]', mapping })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/must be a JSON object/),
    });
  });

  it('refuses an empty payload', () => {
    expect(parseHookPayload({ stdin: '', mapping })).toMatchObject({ ok: false });
  });
});

describe(runRelay, () => {
  let home: string;
  let stderr: ReturnType<typeof spyOnStderr>;

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), 'relay-hook-home-'));
    stderr = spyOnStderr();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(home, { recursive: true, force: true });
  });

  // The mapping table is the relay's entire contract with each harness, so every row is exercised rather than sampled.
  it.each([
    { harness: 'claude', hook: 'SessionStart', type: 'session.started' },
    { harness: 'claude', hook: 'SessionEnd', type: 'session.ended' },
    { harness: 'claude', hook: 'UserPromptSubmit', type: 'turn.started' },
    { harness: 'claude', hook: 'Stop', type: 'turn.completed' },
    { harness: 'rovodev', hook: 'on_session_start', type: 'session.started' },
    { harness: 'rovodev', hook: 'on_session_end', type: 'session.ended' },
    { harness: 'rovodev', hook: 'on_user_prompt', type: 'turn.started' },
    { harness: 'rovodev', hook: 'on_complete', type: 'turn.completed' },
  ])('relays the $harness $hook hook as $type', async ({ harness, hook, type }) => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });

    const result = await runRelay({
      argv: ['--harness', harness, '--hook', hook, '--home', home],
      stdin: JSON.stringify({ session_id: 's1', cwd }),
      cwd: '/nowhere',
      env: {},
      now: NOW,
    });

    const [envelope] = await readEvents(result);
    expect(envelope).toMatchObject({ type, harness });
  });

  it('appends a full envelope attributed to the session and repo the payload names', async () => {
    const cwd = await makeRepo({ branch: 'MAC-42/feat/thing', remote: REMOTE_URL });

    const result = await runRelay({
      argv: ['--harness', 'claude', '--hook', 'SessionStart', '--home', home],
      stdin: JSON.stringify({ session_id: 'hook-session', cwd, source: 'startup' }),
      cwd: '/nowhere',
      env: {},
      now: NOW,
    });

    expect(result).toEqual({
      ok: true,
      id: expect.stringMatching(ULID_PATTERN),
      path: eventPath(home, 'williamthorsen', 'codeassembly', 'MAC-42-feat-thing', 'hook-session'),
    });
    expect(await readEvents(result)).toEqual([
      {
        id: expect.stringMatching(ULID_PATTERN),
        ts: '2026-07-16T09:30:00.000Z',
        type: 'session.started',
        repo: 'williamthorsen/codeassembly',
        branch: 'MAC-42/feat/thing',
        session: 'hook-session',
        cwd,
        harness: 'claude',
        payload: { source: 'startup' },
      },
    ]);
  });

  it('carries a session-end discriminator through into the event payload', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });

    const result = await runRelay({
      argv: ['--harness', 'claude', '--hook', 'SessionEnd', '--home', home],
      stdin: JSON.stringify({ session_id: 's1', cwd, reason: 'prompt_input_exit' }),
      cwd: '/nowhere',
      env: {},
      now: NOW,
    });

    const [envelope] = await readEvents(result);
    expect(envelope?.payload).toEqual({ reason: 'prompt_input_exit' });
  });

  it('carries Rovo’s nested attributes through on a session end', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });

    const result = await runRelay({
      argv: ['--harness', 'rovodev', '--hook', 'on_session_end', '--home', home],
      stdin: JSON.stringify({ session_id: 's1', cwd, attributes: { reason: 'switch' } }),
      cwd: '/nowhere',
      env: {},
      now: NOW,
    });

    const [envelope] = await readEvents(result);
    expect(envelope?.payload).toEqual({ attributes: { reason: 'switch' } });
  });

  it('gives a turn boundary an empty payload rather than the prompt text', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });

    const result = await runRelay({
      argv: ['--harness', 'claude', '--hook', 'UserPromptSubmit', '--home', home],
      stdin: JSON.stringify({ session_id: 's1', cwd, user_input: 'do the thing' }),
      cwd: '/nowhere',
      env: {},
      now: NOW,
    });

    const [envelope] = await readEvents(result);
    expect(envelope?.payload).toEqual({});
  });

  it('attributes the event to the payload’s cwd, not the directory the hook was spawned in', async () => {
    const session = await makeRepo({ branch: 'session-branch', remote: REMOTE_URL });
    const spawned = await makeRepo({ branch: 'spawn-branch', remote: REMOTE_URL });

    const result = await runRelay({
      argv: ['--harness', 'claude', '--hook', 'Stop', '--home', home],
      stdin: JSON.stringify({ session_id: 's1', cwd: session }),
      cwd: spawned,
      env: {},
      now: NOW,
    });

    expect(result).toMatchObject({
      path: eventPath(home, 'williamthorsen', 'codeassembly', 'session-branch', 's1'),
    });
    const [envelope] = await readEvents(result);
    expect(envelope?.cwd).toBe(session);

    await rm(spawned, { recursive: true, force: true });
  });

  it('falls back to its own working directory when the payload names none', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });

    const result = await runRelay({
      argv: ['--harness', 'claude', '--hook', 'Stop', '--home', home],
      stdin: JSON.stringify({ session_id: 's1' }),
      cwd,
      env: {},
      now: NOW,
    });

    const [envelope] = await readEvents(result);
    expect(envelope).toMatchObject({ cwd, branch: 'main' });
  });

  it('falls back to the environment session when the payload carries none', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });

    const result = await runRelay({
      argv: ['--harness', 'claude', '--hook', 'Stop', '--home', home],
      stdin: JSON.stringify({ cwd }),
      cwd: '/nowhere',
      env: ENV_WITH_SESSION,
      now: NOW,
    });

    expect(result).toMatchObject({ path: eventPath(home, 'williamthorsen', 'codeassembly', 'main', 'env-session') });
  });

  it('prefers the payload’s session over the environment’s', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });

    const result = await runRelay({
      argv: ['--harness', 'claude', '--hook', 'Stop', '--home', home],
      stdin: JSON.stringify({ session_id: 'payload-session', cwd }),
      cwd: '/nowhere',
      env: ENV_WITH_SESSION,
      now: NOW,
    });

    const [envelope] = await readEvents(result);
    expect(envelope?.session).toBe('payload-session');
  });

  it('still relays the event when the session runs outside a git repository', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'relay-hook-bare-'));

    const result = await runRelay({
      argv: ['--harness', 'claude', '--hook', 'SessionStart', '--home', home],
      stdin: JSON.stringify({ session_id: 's1', cwd }),
      cwd: '/nowhere',
      env: {},
      now: NOW,
    });

    expect(result).toMatchObject({ ok: true, path: eventPath(home, '_no-repo', '_no-repo', '_no-branch', 's1') });

    await rm(cwd, { recursive: true, force: true });
  });

  it('relays nothing for a hook the mapping does not know', async () => {
    const result = await runRelay({
      argv: ['--harness', 'claude', '--hook', 'PreToolUse', '--home', home],
      stdin: JSON.stringify({ session_id: 's1', cwd: '/repos/thing' }),
      cwd: '/nowhere',
      env: {},
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, error: 'unknown-hook' });
    await expect(listEventsRoot(home)).resolves.toEqual([]);
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/maps to no event type/));
  });

  it('relays nothing for a hook belonging to the other harness', async () => {
    const result = await runRelay({
      argv: ['--harness', 'rovodev', '--hook', 'SessionStart', '--home', home],
      stdin: JSON.stringify({ session_id: 's1', cwd: '/repos/thing' }),
      cwd: '/nowhere',
      env: {},
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, error: 'unknown-hook' });
    await expect(listEventsRoot(home)).resolves.toEqual([]);
  });

  it('reports invalid args without writing anything', async () => {
    const result = await runRelay({
      argv: ['--hook', 'Stop', '--home', home],
      stdin: '{}',
      cwd: '/nowhere',
      env: {},
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid-args' });
    await expect(listEventsRoot(home)).resolves.toEqual([]);
  });

  it('reports a malformed payload without writing anything', async () => {
    const result = await runRelay({
      argv: ['--harness', 'claude', '--hook', 'Stop', '--home', home],
      stdin: '{not json',
      cwd: '/nowhere',
      env: {},
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid-payload' });
    await expect(listEventsRoot(home)).resolves.toEqual([]);
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/not valid JSON/));
  });

  it('reports a failed write rather than throwing', async () => {
    const cwd = await makeRepo({ branch: 'main', remote: REMOTE_URL });
    // A regular file where the events root needs a directory: the recursive `mkdir` cannot succeed, which is the
    // cheapest reproduction of an unwritable events root.
    const blockedHome = path.join(home, 'blocked');
    await writeFile(blockedHome, 'not a directory', 'utf8');

    const result = await runRelay({
      argv: ['--harness', 'claude', '--hook', 'Stop', '--home', blockedHome],
      stdin: JSON.stringify({ session_id: 's1', cwd }),
      cwd: '/nowhere',
      env: {},
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, error: 'write-failed' });
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/could not append the event/));
  });
});

// region | Helpers

/** Builds the path the relay should write to, under the test's isolated `home`. */
function eventPath(home: string, owner: string, name: string, branch: string, session: string): string {
  return path.join(home, '.codeassembly', 'events', owner, name, branch, `${session}.jsonl`);
}

/** Lists the events root under `home`, treating an absent root as empty — the state a declined relay leaves it in. */
async function listEventsRoot(home: string): Promise<string[]> {
  try {
    return await readdir(path.join(home, '.codeassembly'));
  } catch {
    return [];
  }
}

/** Stands up a throwaway git repo on `branch`, optionally with an `origin` remote. */
async function makeRepo(input: { branch: string; remote?: string }): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), 'relay-hook-repo-'));
  await execFileAsync('git', ['-C', repo, 'init', '--quiet', `--initial-branch=${input.branch}`]);
  if (input.remote !== undefined) {
    await execFileAsync('git', ['-C', repo, 'remote', 'add', 'origin', input.remote]);
  }
  return repo;
}

/**
 * Reads back every envelope appended to the log the result names, as raw records. Throws when the relay did not
 * succeed. The envelopes stay `unknown`-valued rather than typed as `EventEnvelope`: these assertions exist to prove
 * what actually reached the file, so re-imposing the producer's type on the bytes it wrote would beg the question.
 */
async function readEvents(result: RelayResult): Promise<Record<string, unknown>[]> {
  if (!result.ok) {
    throw new Error(`expected a successful relay, got ${JSON.stringify(result)}`);
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

/** Silences the relay's stderr diagnostics and captures them for assertion. */
function spyOnStderr() {
  return vi.spyOn(process.stderr, 'write').mockReturnValue(true);
}

// endregion | Helpers
