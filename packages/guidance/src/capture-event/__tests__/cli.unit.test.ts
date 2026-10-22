import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SharedGit } from '../../shared/git.ts';
import { makeBodyStream } from '../../test-utils/make-body-stream.ts';
import { makeFakeGit } from '../../test-utils/make-fake-git.ts';
import { parseArgs, runCapture } from '../cli.ts';
import { makeStore } from '../test-utils/make-store.ts';
import { NO_REMOTE_GIT } from '../test-utils/no-remote-git.ts';
import { NOW } from '../test-utils/now.ts';

const ID = '01HZZZZZZZZZZZZZZZZZZZZZZZZ';

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

// region | Helpers

/** Builds a working directory whose git adapter lists a single named remote, from which `resolveRepo` derives an `owner/name`. */
function buildRepoWithRemote(url: string, name = 'origin'): { cwd: string; git: SharedGit } {
  return { cwd: '/tmp/capture-cli-repo', git: makeFakeGit({ remotes: [{ name, url }] }) };
}

// endregion | Helpers
