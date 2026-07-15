import { execFile } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { parseArgs, runCapture } from '../cli.ts';

const execFileAsync = promisify(execFile);

/** The upstream branch the fixture store tracks. Deliberately not `main` — see {@link makeGitBackedStore}. */
const UPSTREAM_BRANCH = 'trunk';

/** The remote-tracking ref the fixture publishes to, standing in for what a push would update. */
const UPSTREAM_REF = `refs/remotes/origin/${UPSTREAM_BRANCH}`;

/** Initialize a throwaway git repo with a single named remote, so `resolveRepo` can derive an `owner/name`. */
async function makeRepoWithRemote(remoteUrl: string, remoteName = 'origin'): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), 'capture-cli-repo-'));
  await execFileAsync('git', ['-C', repo, 'init', '--quiet']);
  await execFileAsync('git', ['-C', repo, 'remote', 'add', remoteName, remoteUrl]);
  return repo;
}

const NOW = new Date('2026-06-04T06:57:22.000Z');

const ID = '01HZZZZZZZZZZZZZZZZZZZZZZZZ';

const STORE_CONFIG = `targets:
  - 'content/**/*.md'
exclude:
  - '**/node_modules/**'
`;

function bodyStream(body: string): Readable {
  return Readable.from([Buffer.from(body, 'utf8')]);
}

/** Create a temp event store directory carrying a default `.kb/config.yaml`, returning its path. */
async function makeStoreDir(): Promise<string> {
  const storePath = await mkdtemp(join(tmpdir(), 'capture-cli-store-'));
  await mkdir(join(storePath, '.kb'), { recursive: true });
  await writeFile(join(storePath, '.kb', 'config.yaml'), STORE_CONFIG, 'utf8');
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

/**
 * Stand up a git-backed event store with a seeded upstream commit, registered under `name`. The upstream is synthesized
 * locally — no bare remote, no `git push` — because a push is fixture here, not subject, and the process spawns it costs
 * are what make this suite contend with itself under parallel runs.
 *
 * The store's branch deliberately tracks `origin/trunk` rather than `origin/main`. `isEventPushed` reads the branch's
 * *configured* upstream, and if the fixture tracked the default name, an implementation that hardcoded `origin/main`
 * would resolve identically and the test could not tell the two apart. Tracking a non-default name is what makes that
 * substitution fail.
 */
async function makeGitBackedStore(name: string): Promise<{ storePath: string; home: string }> {
  const storePath = await makeStoreDir();
  await execFileAsync('git', ['-C', storePath, 'init', '--quiet', '-b', 'main']);
  await writeGitTrackingConfig(storePath);
  await execFileAsync('git', ['-C', storePath, 'add', '-A']);
  await execFileAsync('git', ['-C', storePath, 'commit', '--quiet', '-m', 'seed']);
  await publish(storePath);

  const home = await mkdtemp(join(tmpdir(), 'capture-cli-githome-'));
  await mkdir(join(home, '.agents'), { recursive: true });
  await writeFile(
    join(home, '.agents', 'kb.yaml'),
    `default_kb: ${name}\nkbs:\n  ${name}:\n    path: ${storePath}\n`,
    'utf8',
  );

  return { storePath, home };
}

/** Stage and commit the store's working tree, then publish it to the synthesized upstream. */
async function commitAndPublish(storePath: string): Promise<void> {
  await execFileAsync('git', ['-C', storePath, 'add', '-A']);
  await execFileAsync('git', ['-C', storePath, 'commit', '--quiet', '-m', 'capture']);
  await publish(storePath);
}

/** Advance the store's upstream ref to its current `HEAD`, standing in for what a `git push` would do. */
async function publish(storePath: string): Promise<void> {
  await execFileAsync('git', ['-C', storePath, 'update-ref', UPSTREAM_REF, 'HEAD']);
}

/**
 * Write the tracking configuration that makes `@{upstream}` resolve, appended to `.git/config` in one write rather than
 * set through a `git config` subprocess apiece. All three parts are load-bearing: without the remote's fetch refspec,
 * git cannot map the branch onto a remote-tracking ref and `@{upstream}` fails outright with "upstream branch not stored
 * as a remote-tracking branch". The remote is never dialed — its URL exists only to satisfy the config's shape.
 */
async function writeGitTrackingConfig(storePath: string): Promise<void> {
  const config = [
    '[user]',
    '\temail = test@example.com',
    '\tname = Test',
    '[commit]',
    '\tgpgsign = false',
    '[remote "origin"]',
    `\turl = ${storePath}`,
    '\tfetch = +refs/heads/*:refs/remotes/origin/*',
    '[branch "main"]',
    '\tremote = origin',
    `\tmerge = refs/heads/${UPSTREAM_BRANCH}`,
    '',
  ].join('\n');
  await appendFile(join(storePath, '.git', 'config'), config, 'utf8');
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
      allowPushed: false,
    });
  });

  it('parses --amend and the --allow-pushed boolean flag', () => {
    const parsed = parseArgs(['--summary', 'x', '--amend', ID, '--allow-pushed']);
    expect(parsed.amend).toBe(ID);
    expect(parsed.allowPushed).toBe(true);
  });

  it('leaves amend null and allowPushed false when both are omitted', () => {
    const parsed = parseArgs(['--summary', 'x']);
    expect(parsed.amend).toBeNull();
    expect(parsed.allowPushed).toBe(false);
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

  it('captures an event with no session field when the harness exposes no session id', async () => {
    const { home } = await makeStore('codeassembly');
    const repo = await makeRepoWithRemote('git@github.com:williamthorsen/codeassembly.git');

    const result = await runCapture({
      argv: ['--store', '@default', '--summary', 'Noticed a thing'],
      stdin: bodyStream('Body text.'),
      cwd: repo,
      env: {},
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const written = await readFile(result.path, 'utf8');
      expect(written).not.toMatch(/^session:/m);
      expect(written).toContain('summary: Noticed a thing');
    }
  });

  it('treats a blank session id as no session at all', async () => {
    const { home } = await makeStore('codeassembly');
    const repo = await makeRepoWithRemote('git@github.com:williamthorsen/codeassembly.git');

    const result = await runCapture({
      argv: ['--store', '@default', '--summary', 'Noticed a thing'],
      stdin: bodyStream('Body text.'),
      cwd: repo,
      env: { CLAUDE_CODE_SESSION_ID: '' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const written = await readFile(result.path, 'utf8');
      expect(written).not.toMatch(/^session:/m);
    }
  });

  it('amends an event stored with an empty session, dropping the empty field', async () => {
    const { storePath, home } = await makeStore('codeassembly');
    await mkdir(join(storePath, 'content', 'events'), { recursive: true });
    await writeFile(
      join(storePath, 'content', 'events', `${ID}.md`),
      `---\nrecordType: event\nid: ${ID}\ncaptured-at: 2026-06-04T06:57:22Z\nsession: ''\ncwd: /tmp/work\nsummary: Original summary\nharness: rovodev\n---\n\nOriginal body.\n`,
      'utf8',
    );

    const amended = await runCapture({
      argv: ['--store', '@default', '--amend', ID, '--summary', 'Corrected summary'],
      stdin: bodyStream('Corrected body.'),
      cwd: '/tmp/different-cwd',
      env: {},
      now: NOW,
      home,
    });

    expect(amended.ok).toBe(true);
    if (amended.ok) {
      const written = await readFile(amended.path, 'utf8');
      expect(written).not.toMatch(/^session:/m);
      expect(written).toContain('summary: Corrected summary');
      expect(written).toContain('harness: rovodev');
      expect(written).toContain('cwd: /tmp/work');
    }
  });

  it('writes the impact field when --impact is supplied', async () => {
    const { home } = await makeStore('codeassembly');
    const repo = await makeRepoWithRemote('git@github.com:williamthorsen/codeassembly.git');

    const result = await runCapture({
      argv: ['--store', '@default', '--summary', 'Noticed a thing', '--impact', 'high'],
      stdin: bodyStream('Body text.'),
      cwd: repo,
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
      now: NOW,
      home,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const written = await readFile(result.path, 'utf8');
      expect(written).toMatch(/^impact: high$/m);
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
      env: { CLAUDE_CODE_SESSION_ID: 'session-xyz' },
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

  it('amends an unpushed event, editing content while preserving provenance and unsupplied fields', async () => {
    const { home } = await makeStore('codeassembly');
    const repo = await makeRepoWithRemote('git@github.com:williamthorsen/codeassembly.git');

    const created = await runCapture({
      argv: ['--store', '@default', '--summary', 'Original summary', '--tags', 'one', '--impact', 'high'],
      stdin: bodyStream('Original body.'),
      cwd: repo,
      env: { CLAUDE_CODE_SESSION_ID: 'session-original' },
      now: NOW,
      home,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const amended = await runCapture({
      argv: ['--store', '@default', '--amend', created.id, '--summary', 'Corrected summary'],
      stdin: bodyStream('Corrected body.'),
      cwd: '/tmp/different-cwd',
      env: { CLAUDE_CODE_SESSION_ID: 'session-later' },
      now: new Date('2027-01-01T00:00:00.000Z'),
      home,
    });

    expect(amended.ok).toBe(true);
    if (amended.ok) {
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

      // Curatorial fields the amend did not restate keep their existing values.
      expect(written).toMatch(/^tags: \[one\]$/m);
      expect(written).toMatch(/^impact: high$/m);
    }
  });

  it('overrides curatorial fields on amend only when their flag is supplied', async () => {
    const { home } = await makeStore('codeassembly');
    const repo = await makeRepoWithRemote('git@github.com:williamthorsen/codeassembly.git');

    const created = await runCapture({
      argv: ['--store', '@default', '--summary', 'Original', '--tags', 'one', '--impact', 'high'],
      stdin: bodyStream('Body.'),
      cwd: repo,
      env: { CLAUDE_CODE_SESSION_ID: 'session-original' },
      now: NOW,
      home,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const amended = await runCapture({
      argv: ['--store', '@default', '--amend', created.id, '--summary', 'Original', '--tags', 'two', '--impact', 'low'],
      stdin: bodyStream('Body.'),
      cwd: repo,
      env: { CLAUDE_CODE_SESSION_ID: 'session-original' },
      now: NOW,
      home,
    });

    expect(amended.ok).toBe(true);
    if (amended.ok) {
      const written = await readFile(amended.path, 'utf8');
      expect(written).toMatch(/^tags: \[two\]$/m);
      expect(written).toMatch(/^impact: low$/m);
    }
  });

  it('returns amend-not-found when the target event does not exist', async () => {
    const { home } = await makeStore('codeassembly');

    const result = await runCapture({
      argv: ['--store', '@default', '--amend', ID, '--summary', 'x'],
      stdin: bodyStream('body'),
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

  it('refuses to amend a pushed event, then allows it with --allow-pushed', async () => {
    const { storePath, home } = await makeGitBackedStore('codeassembly');

    const created = await runCapture({
      argv: ['--store', '@default', '--summary', 'Pushed summary'],
      stdin: bodyStream('Pushed body.'),
      cwd: storePath,
      env: { CLAUDE_CODE_SESSION_ID: 'session-original' },
      now: NOW,
      home,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await commitAndPublish(storePath);

    const refused = await runCapture({
      argv: ['--store', '@default', '--amend', created.id, '--summary', 'Reworded'],
      stdin: bodyStream('Reworded body.'),
      cwd: storePath,
      env: {},
      now: NOW,
      home,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error).toBe('event-pushed');
      expect(refused.message).toContain('--allow-pushed');
    }

    const forced = await runCapture({
      argv: ['--store', '@default', '--amend', created.id, '--summary', 'Reworded', '--allow-pushed'],
      stdin: bodyStream('Reworded body.'),
      cwd: storePath,
      env: {},
      now: NOW,
      home,
    });
    expect(forced.ok).toBe(true);
    if (forced.ok) {
      const written = await readFile(forced.path, 'utf8');
      expect(written).toContain('Reworded body.');
      expect(written).not.toContain('Pushed body.');
    }
  });
});
