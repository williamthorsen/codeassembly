import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SharedGit } from '../../shared/git.ts';
import { makeBodyStream } from '../../test-utils/make-body-stream.ts';
import { makeFakeGit } from '../../test-utils/make-fake-git.ts';
import { parseArgs, runCapture } from '../cli.ts';

/** A git adapter for a working directory without any remote. */
const NO_REMOTE_GIT = makeFakeGit();

const NOW = new Date('2026-06-04T06:57:22.000Z');

const ID = '01HZZZZZZZZZZZZZZZZZZZZZZZZ';

const STORE_CONFIG = `targets:
  - 'content/**/*.md'
exclude:
  - '**/node_modules/**'
`;

/** Builds a working directory whose git adapter lists a single named remote, from which `resolveRepo` derives an `owner/name`. */
function buildRepoWithRemote(url: string, name = 'origin'): { cwd: string; git: SharedGit } {
  return { cwd: '/tmp/capture-cli-repo', git: makeFakeGit({ remotes: [{ name, url }] }) };
}

/** Creates a temp event store directory containing a default `.kb/config.yaml`, returning its path. */
async function makeStoreDir(): Promise<string> {
  const storePath = await mkdtemp(join(tmpdir(), 'capture-cli-store-'));
  await mkdir(join(storePath, '.kb'), { recursive: true });
  await writeFile(join(storePath, '.kb', 'config.yaml'), STORE_CONFIG, 'utf8');
  return storePath;
}

/** Creates a temp event store plus an isolated home that registers it under `name` and marks it `default_kb`. */
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
      '--impact',
      'high',
    ]);

    expect(parsed).toEqual({
      store: 'codeassembly',
      summary: 'A summary',
      skill: 'kb-retrieve',
      model: 'claude-opus-4-8',
      harness: 'claude',
      tags: ['one', 'two', 'three'],
      impact: 'high',
      amend: null,
    });
  });

  it('parses --amend', () => {
    const parsed = parseArgs(['--summary', 'x', '--amend', ID]);
    expect(parsed.amend).toBe(ID);
  });

  it('leaves amend null when omitted', () => {
    const parsed = parseArgs(['--summary', 'x']);
    expect(parsed.amend).toBeNull();
  });

  it('rejects an --amend id that is not a bare filename stem', () => {
    expect(() => parseArgs(['--summary', 'x', '--amend', '../escape'])).toThrow(/bare filename stem/);
  });

  it('leaves the store null and optional flags null or empty when omitted', () => {
    const parsed = parseArgs(['--summary', 'Noticed']);

    expect(parsed.store).toBeNull();
    expect(parsed.skill).toBeNull();
    expect(parsed.model).toBeNull();
    expect(parsed.harness).toBeNull();
    expect(parsed.tags).toEqual([]);
    expect(parsed.impact).toBeNull();
  });

  it('throws on an out-of-enum --impact', () => {
    expect(() => parseArgs(['--summary', 'x', '--impact', 'urgent'])).toThrow(/--impact must be one of/);
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

  it('binds an inline =value verbatim even when it begins with --', () => {
    expect(parseArgs(['--summary', 'x', '--skill=--odd-skill']).skill).toBe('--odd-skill');
  });

  it('rejects an empty value for an optional flag rather than writing an empty field', () => {
    expect(() => parseArgs(['--summary', 'x', '--skill='])).toThrow(/--skill requires a value/);
  });

  it('rejects an empty --store rather than deferring the failure to store resolution', () => {
    expect(() => parseArgs(['--summary', 'x', '--store='])).toThrow(/--store requires a value/);
  });

  it('rejects an unexpected positional argument', () => {
    expect(() => parseArgs(['--summary', 'x', 'stray'])).toThrow(/unexpected argument/);
  });
});

describe(runCapture, () => {
  it('writes recordType: event and returns a ULID id and second-precision capturedAt', async () => {
    const { home } = await makeStore('codeassembly');
    const { cwd: repo, git } = buildRepoWithRemote('git@github.com:williamthorsen/codeassembly.git');

    const result = await runCapture({
      argv: ['--store', '@default', '--summary', 'Noticed a thing'],
      stdin: makeBodyStream('Body text.'),
      cwd: repo,
      git,
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

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
  });

  it('captures an event without a session field when the harness does not expose a session id', async () => {
    const { home } = await makeStore('codeassembly');
    const { cwd: repo, git } = buildRepoWithRemote('git@github.com:williamthorsen/codeassembly.git');

    const result = await runCapture({
      argv: ['--store', '@default', '--summary', 'Noticed a thing'],
      stdin: makeBodyStream('Body text.'),
      cwd: repo,
      git,
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const written = await readFile(result.path, 'utf8');
    expect(written).not.toMatch(/^session:/m);
    expect(written).toContain('summary: Noticed a thing');
  });

  it('treats a blank session id as a missing one', async () => {
    const { home } = await makeStore('codeassembly');
    const { cwd: repo, git } = buildRepoWithRemote('git@github.com:williamthorsen/codeassembly.git');

    const result = await runCapture({
      argv: ['--store', '@default', '--summary', 'Noticed a thing'],
      stdin: makeBodyStream('Body text.'),
      cwd: repo,
      git,
      env: { CLAUDE_CODE_SESSION_ID: '' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const written = await readFile(result.path, 'utf8');
    expect(written).not.toMatch(/^session:/m);
  });

  it('amends an event stored with an empty session, dropping the empty field', async () => {
    const { storePath, home } = await makeStore('codeassembly');
    await mkdir(join(storePath, 'content', 'events'), { recursive: true });
    await writeFile(
      join(storePath, 'content', 'events', `${ID}.md`),
      `---\nrecordType: event\nid: ${ID}\ncaptured-at: 2026-06-04T06:57:22Z\nsession: ''\ncwd: /tmp/work\nsummary: Original summary\nharness: rovo\n---\n\nOriginal body.\n`,
      'utf8',
    );

    const amended = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', '@default', '--amend', ID, '--summary', 'Corrected summary'],
      stdin: makeBodyStream('Corrected body.'),
      cwd: '/tmp/different-cwd',
      env: {},
      now: NOW,
      home,
    });

    expect(amended.ok).toBe(true);
    if (!amended.ok) return;

    const written = await readFile(amended.path, 'utf8');
    expect(written).not.toMatch(/^session:/m);
    expect(written).toContain('summary: Corrected summary');
    expect(written).toContain('harness: rovo');
    expect(written).toContain('cwd: /tmp/work');
  });

  it('writes the impact field when --impact is supplied', async () => {
    const { home } = await makeStore('codeassembly');
    const { cwd: repo, git } = buildRepoWithRemote('git@github.com:williamthorsen/codeassembly.git');

    const result = await runCapture({
      argv: ['--store', '@default', '--summary', 'Noticed a thing', '--impact', 'high'],
      stdin: makeBodyStream('Body text.'),
      cwd: repo,
      git,
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const written = await readFile(result.path, 'utf8');
    expect(written).toMatch(/^impact: high$/m);
  });

  it('writes the harness field when --harness is supplied', async () => {
    const { home } = await makeStore('codeassembly');
    const { cwd: repo, git } = buildRepoWithRemote('git@github.com:williamthorsen/codeassembly.git');

    const result = await runCapture({
      argv: ['--store', '@default', '--summary', 'Noticed a thing', '--harness', 'claude'],
      stdin: makeBodyStream('Body text.'),
      cwd: repo,
      git,
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const written = await readFile(result.path, 'utf8');
    expect(written).toMatch(/^harness: claude$/m);
  });

  it('resolves repo via the first-remote fallback when origin is absent', async () => {
    const { home } = await makeStore('codeassembly');
    const { cwd: repo, git } = buildRepoWithRemote('git@github.com:williamthorsen/codeassembly.git', 'upstream');

    const result = await runCapture({
      argv: ['--store', '@default', '--summary', 'Noticed a thing'],
      stdin: makeBodyStream('Body text.'),
      cwd: repo,
      git,
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const written = await readFile(result.path, 'utf8');
    expect(written).toContain('repo: williamthorsen/codeassembly');
  });

  it('writes an event with repo absent when cwd does not have a git remote', async () => {
    const { home } = await makeStore('codeassembly');
    const bareDir = await mkdtemp(join(tmpdir(), 'capture-cli-norepo-'));

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', '@default', '--summary', 'Noticed a thing'],
      stdin: makeBodyStream('Body text.'),
      cwd: bareDir,
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const written = await readFile(result.path, 'utf8');
    expect(written).not.toMatch(/^repo:/m);
  });

  it('writes to the registered store, not a .kb in cwd, when capturing from a directory containing one', async () => {
    const { storePath, home } = await makeStore('codeassembly');
    const cwdWithKb = await mkdtemp(join(tmpdir(), 'capture-cli-cwdkb-'));
    await mkdir(join(cwdWithKb, '.kb'), { recursive: true });

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', 'codeassembly', '--summary', 'Noticed a thing'],
      stdin: makeBodyStream('Body text.'),
      cwd: cwdWithKb,
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.path.startsWith(storePath)).toBe(true);
    const cwdEntries = await readdir(cwdWithKb);
    expect(cwdEntries).not.toContain('content');
  });

  it('fails when the named store is not registered', async () => {
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-empty-'));

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', 'missing', '--summary', 'x'],
      stdin: makeBodyStream(''),
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
      git: NO_REMOTE_GIT,
      argv: ['--store', 'named', '--summary', 'Noticed a thing'],
      stdin: makeBodyStream('Body text.'),
      cwd: '/tmp/elsewhere',
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.store).toBe('named');
    expect(result.path.startsWith(namedStore)).toBe(true);
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
      git: NO_REMOTE_GIT,
      argv: ['--summary', 'x'],
      stdin: makeBodyStream(''),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toBe('missing-store');
    expect(result.message).toContain('secondary');
    expect(result.message).toContain('default is "primary"');
    expect(result.message).toContain('--store @default');
  });

  it('fails with no-default-store when --store @default is given but default_kb is not configured', async () => {
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-nodefault-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(join(home, '.agents', 'kb.yaml'), 'kbs:\n  codeassembly:\n    path: /tmp/whatever\n', 'utf8');

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', '@default', '--summary', 'x'],
      stdin: makeBodyStream(''),
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

  it('writes to the feedback_kb, not the default_kb, when --store @feedback is given', async () => {
    const defaultStore = await makeStoreDir();
    const feedbackStore = await makeStoreDir();
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-feedback-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(
      join(home, '.agents', 'kb.yaml'),
      `default_kb: personal\nfeedback_kb: guidance\nkbs:\n  guidance:\n    path: ${feedbackStore}\n  personal:\n    path: ${defaultStore}\n`,
      'utf8',
    );

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', '@feedback', '--summary', 'Noticed a thing'],
      stdin: makeBodyStream('Body text.'),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.store).toBe('guidance');
    expect(result.path.startsWith(feedbackStore)).toBe(true);
  });

  it('fails with no-feedback-store naming the key when --store @feedback is given but feedback_kb is not configured', async () => {
    const { home } = await makeStore('codeassembly');

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', '@feedback', '--summary', 'x'],
      stdin: makeBodyStream(''),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toBe('no-feedback-store');
    expect(result.message).toBe('--store @feedback was given but kb.yaml does not configure feedback_kb');
  });

  it('fails with missing-store, naming both role sentinels when both roles are configured', async () => {
    const defaultStore = await makeStoreDir();
    const feedbackStore = await makeStoreDir();
    const home = await mkdtemp(join(tmpdir(), 'capture-cli-missingroles-'));
    await mkdir(join(home, '.agents'), { recursive: true });
    await writeFile(
      join(home, '.agents', 'kb.yaml'),
      `default_kb: personal\nfeedback_kb: guidance\nkbs:\n  guidance:\n    path: ${feedbackStore}\n  personal:\n    path: ${defaultStore}\n`,
      'utf8',
    );

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--summary', 'x'],
      stdin: makeBodyStream(''),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.message).toContain('the registry default is "personal", available as --store @default');
    expect(result.message).toContain('the feedback store is "guidance", available as --store @feedback');
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
      git: NO_REMOTE_GIT,
      argv: ['--store', 'realstore', '--summary', 'x'],
      stdin: makeBodyStream(''),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toBe('store-not-registered');
    expect(result.message).toMatch(/default_kb "ghost" does not match any registered KB/);
  });

  it('returns invalid-args when a required flag is missing', async () => {
    const { home } = await makeStore('codeassembly');

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', 'codeassembly'],
      stdin: makeBodyStream(''),
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

  it('amends an event, editing content while preserving provenance and unsupplied fields', async () => {
    const { home } = await makeStore('codeassembly');
    const { cwd: repo, git } = buildRepoWithRemote('git@github.com:williamthorsen/codeassembly.git');

    const created = await runCapture({
      argv: ['--store', '@default', '--summary', 'Original summary', '--tags', 'one', '--impact', 'high'],
      stdin: makeBodyStream('Original body.'),
      cwd: repo,
      git,
      env: { CLAUDE_CODE_SESSION_ID: 'session-original' },
      now: NOW,
      home,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const amended = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', '@default', '--amend', created.id, '--summary', 'Corrected summary'],
      stdin: makeBodyStream('Corrected body.'),
      cwd: '/tmp/different-cwd',
      env: { CLAUDE_CODE_SESSION_ID: 'session-later' },
      now: new Date('2027-01-01T00:00:00.000Z'),
      home,
    });

    expect(amended.ok).toBe(true);
    if (!amended.ok) return;

    expect(amended.id).toBe(created.id);
    expect(amended.capturedAt).toBe(created.capturedAt);

    const written = await readFile(amended.path, 'utf8');
    expect(written).toContain('summary: Corrected summary');
    expect(written).toContain('Corrected body.');
    expect(written).not.toContain('Original body.');

    // Provenance comes from the original capture, not the amending invocation.
    expect(written).toContain(`captured-at: ${created.capturedAt}`);
    expect(written).toContain('session: session-original');
    expect(written).toContain(`cwd: ${repo}`);
    expect(written).toContain('repo: williamthorsen/codeassembly');

    // Curatorial fields that the amend did not restate keep their existing values.
    expect(written).toMatch(/^tags: \[one\]$/m);
    expect(written).toMatch(/^impact: high$/m);
  });

  it('overrides curatorial fields on amend only when their flag is supplied', async () => {
    const { home } = await makeStore('codeassembly');
    const { cwd: repo, git } = buildRepoWithRemote('git@github.com:williamthorsen/codeassembly.git');

    const created = await runCapture({
      argv: ['--store', '@default', '--summary', 'Original', '--tags', 'one', '--impact', 'high'],
      stdin: makeBodyStream('Body.'),
      cwd: repo,
      git,
      env: { CLAUDE_CODE_SESSION_ID: 'session-original' },
      now: NOW,
      home,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const amended = await runCapture({
      argv: ['--store', '@default', '--amend', created.id, '--summary', 'Original', '--tags', 'two', '--impact', 'low'],
      stdin: makeBodyStream('Body.'),
      cwd: repo,
      git,
      env: { CLAUDE_CODE_SESSION_ID: 'session-original' },
      now: NOW,
      home,
    });

    expect(amended.ok).toBe(true);
    if (!amended.ok) return;

    const written = await readFile(amended.path, 'utf8');
    expect(written).toMatch(/^tags: \[two\]$/m);
    expect(written).toMatch(/^impact: low$/m);
  });

  it('returns amend-not-found when the target event does not exist', async () => {
    const { home } = await makeStore('codeassembly');

    const result = await runCapture({
      git: NO_REMOTE_GIT,
      argv: ['--store', '@default', '--amend', ID, '--summary', 'x'],
      stdin: makeBodyStream('body'),
      cwd: '/tmp/elsewhere',
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('amend-not-found');
    }
  });
});
