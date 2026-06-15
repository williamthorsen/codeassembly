import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveSessionContext, parseArgs, sanitizeBranch } from '../cli.ts';

const NOW = new Date('2026-05-26T02:07:41Z');

describe(parseArgs, () => {
  it('returns null fields and no mutations when no args are supplied', () => {
    expect(parseArgs([])).toEqual({ branch: null, cwd: null, home: null, mutations: [] });
  });

  it('parses --branch, --cwd, and --home as separate-token flags', () => {
    expect(parseArgs(['--branch', 'main', '--cwd', '/tmp/foo', '--home', '/tmp/home'])).toEqual({
      branch: 'main',
      cwd: '/tmp/foo',
      home: '/tmp/home',
      mutations: [],
    });
  });

  it('parses --branch=value inline form', () => {
    expect(parseArgs(['--branch=main'])).toEqual({ branch: 'main', cwd: null, home: null, mutations: [] });
  });

  it('parses --home=value inline form', () => {
    expect(parseArgs(['--home=/tmp/x'])).toEqual({ branch: null, cwd: null, home: '/tmp/x', mutations: [] });
  });

  it('parses --cwd=value inline form', () => {
    expect(parseArgs(['--cwd=/tmp/foo'])).toEqual({ branch: null, cwd: '/tmp/foo', home: null, mutations: [] });
  });

  it('parses --set-ticket-url and --set-pr-url as set mutations', () => {
    expect(parseArgs(['--set-ticket-url', 'https://x/issues/1', '--set-pr-url', 'https://x/pull/2']).mutations).toEqual(
      [
        { field: 'ticket_url', value: 'https://x/issues/1' },
        { field: 'pr_url', value: 'https://x/pull/2' },
      ],
    );
  });

  it('parses --set-ticket-url=value inline form', () => {
    expect(parseArgs(['--set-ticket-url=https://x/issues/1']).mutations).toEqual([
      { field: 'ticket_url', value: 'https://x/issues/1' },
    ]);
  });

  it('parses --set-pr-url=value inline form', () => {
    expect(parseArgs(['--set-pr-url=https://x/pull/2']).mutations).toEqual([
      { field: 'pr_url', value: 'https://x/pull/2' },
    ]);
  });

  it('parses --clear-ticket-url and --clear-pr-url as null mutations', () => {
    expect(parseArgs(['--clear-ticket-url', '--clear-pr-url']).mutations).toEqual([
      { field: 'ticket_url', value: null },
      { field: 'pr_url', value: null },
    ]);
  });

  it('throws when --branch has no value', () => {
    expect(() => parseArgs(['--branch'])).toThrow(/--branch requires a value/);
  });

  it('throws when --home has no value', () => {
    expect(() => parseArgs(['--home'])).toThrow(/--home requires a value/);
  });

  it('throws when --set-ticket-url has no value', () => {
    expect(() => parseArgs(['--set-ticket-url'])).toThrow(/--set-ticket-url requires a value/);
  });

  it('throws when --set-pr-url has no value', () => {
    expect(() => parseArgs(['--set-pr-url'])).toThrow(/--set-pr-url requires a value/);
  });

  it('throws on unknown arguments', () => {
    expect(() => parseArgs(['--mystery'])).toThrow(/unknown argument/);
  });
});

describe(sanitizeBranch, () => {
  it('replaces forward slashes with hyphens', () => {
    expect(sanitizeBranch('feat/foo/bar')).toBe('feat-foo-bar');
  });

  it('preserves underscores', () => {
    expect(sanitizeBranch('MAC-130_foo')).toBe('MAC-130_foo');
  });

  it('strips trailing hyphens after replacement', () => {
    expect(sanitizeBranch('feat/')).toBe('feat');
  });

  it('trims surrounding whitespace before processing', () => {
    expect(sanitizeBranch('  feat/foo  ')).toBe('feat-foo');
  });

  it('strips all trailing hyphens produced by consecutive slash replacement', () => {
    // Regression: a single-strip (`s.replace(/-$/, '')`) would yield `feat-`. The bash
    // sanitizer (`sanitize_branch` in `resolve-frontmatter.sh`) loops to match this.
    expect(sanitizeBranch('feat//')).toBe('feat');
  });
});

describe(deriveSessionContext, () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'derive-session-context-cli-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('derives and writes a manifest when none exists', async () => {
    await writeProjectPrefs(workDir, 'project:\n  slug: my-project\n');
    const manifest = await deriveSessionContext({
      cwd: workDir,
      branch: 'MAC-130/feat/x',
      now: NOW,
      home: workDir,
    });
    expect(manifest.ticket_id).toBe('MAC-130');
    expect(manifest.project_slug).toBe('my-project');

    const written = await readFile(path.join(workDir, '.agents', 'MAC-130-feat-x.branch-manifest.json'), 'utf8');
    expect(JSON.parse(written)).toEqual(manifest);
  });

  it('is idempotent: returns the existing manifest without re-deriving', async () => {
    const manifestPath = path.join(workDir, '.agents', 'main.branch-manifest.json');
    await mkdir(path.dirname(manifestPath), { recursive: true });
    const seeded = {
      ticket_id: null,
      ticket_ref: null,
      project_slug: 'seeded',
      platform: 'github',
      default_branch: 'origin/main',
      branch_name: 'main',
      artifact_base_dir: '/tmp/seeded',
      artifact_paths: { chats: 'chats', devlogs: 'devlogs', plans: 'plans' },
      created_at: '2025-01-01T00:00:00Z',
    };
    await writeFile(manifestPath, JSON.stringify(seeded), 'utf8');

    // No preferences file; without the fast path this would still succeed but produce a
    // different `project_slug` (basename of workDir). The idempotency check is that the
    // seeded value survives.
    const result = await deriveSessionContext({
      cwd: workDir,
      branch: 'main',
      now: NOW,
      home: workDir,
    });
    expect(result.project_slug).toBe('seeded');
  });

  it('overwrites a stale-schema manifest (missing required fields)', async () => {
    const manifestPath = path.join(workDir, '.agents', 'main.branch-manifest.json');
    await mkdir(path.dirname(manifestPath), { recursive: true });
    // Stale manifest is missing `platform`, `artifact_base_dir`, and other newer fields.
    await writeFile(manifestPath, JSON.stringify({ ticket_id: 'OLD-1' }), 'utf8');

    const result = await deriveSessionContext({
      cwd: workDir,
      branch: 'main',
      now: NOW,
      home: workDir,
    });
    // The deriver fell through and produced a fresh manifest with all required fields.
    expect(result.platform).toBe('github');
    expect(result.artifact_base_dir).toBeDefined();
    expect(result.ticket_id).toBeNull();
  });

  it('recomposes when a stored URL field is present but wrong-typed', async () => {
    const manifestPath = path.join(workDir, '.agents', 'main.branch-manifest.json');
    await mkdir(path.dirname(manifestPath), { recursive: true });
    // All required fields are present and well-typed, but `ticket_url` is a number rather than
    // `string | null`. `isCurrentSchema` rejects this, forcing a fresh compose that reseeds the URL.
    const seeded = {
      ticket_id: null,
      ticket_ref: null,
      project_slug: 'seeded',
      platform: 'github',
      default_branch: 'origin/main',
      branch_name: 'main',
      artifact_base_dir: '/tmp/seeded',
      artifact_paths: { chats: 'chats', devlogs: 'devlogs', plans: 'plans' },
      created_at: '2025-01-01T00:00:00Z',
      ticket_url: 42,
    };
    await writeFile(manifestPath, JSON.stringify(seeded), 'utf8');

    const result = await deriveSessionContext({ cwd: workDir, branch: 'main', now: NOW, home: workDir });
    expect(result.platform).toBe('github');
    expect(result.ticket_url).toBeNull();
  });

  it('overwrites a corrupt manifest (invalid JSON)', async () => {
    const manifestPath = path.join(workDir, '.agents', 'main.branch-manifest.json');
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, '{ not valid json', 'utf8');

    const result = await deriveSessionContext({
      cwd: workDir,
      branch: 'main',
      now: NOW,
      home: workDir,
    });
    expect(result.branch_name).toBe('main');
  });

  it('reads an old-format `.manifest.json` and migrates it to the new-format path', async () => {
    const oldPath = path.join(workDir, '.agents', 'main.manifest.json');
    const newPath = path.join(workDir, '.agents', 'main.branch-manifest.json');
    await mkdir(path.dirname(oldPath), { recursive: true });
    const seeded = {
      ticket_id: 'OLD-1',
      ticket_ref: 'OLD-1',
      project_slug: 'old-format',
      platform: 'github',
      default_branch: 'origin/main',
      branch_name: 'main',
      artifact_base_dir: '/tmp/old',
      artifact_paths: { chats: 'chats', devlogs: 'devlogs', plans: 'plans' },
      created_at: '2025-01-01T00:00:00Z',
    };
    await writeFile(oldPath, JSON.stringify(seeded), 'utf8');

    const result = await deriveSessionContext({
      cwd: workDir,
      branch: 'main',
      now: NOW,
      home: workDir,
    });
    expect(result.project_slug).toBe('old-format');

    // Migration: after a successful old-format read, the new-format file is also written so
    // subsequent calls hit the fast path. Without this, every call re-invokes the deriver.
    const migrated = JSON.parse(await readFile(newPath, 'utf8'));
    expect(migrated).toEqual(seeded);
  });

  it('rejects with a write error when `.agents/` is not writable', async () => {
    // Pre-create `.agents/` as read-only so the deriver's `writeFile` step fails.
    // Skipped on root, where chmod restrictions are bypassed and the write would succeed.
    if (process.getuid?.() === 0) {
      return;
    }
    const agentsDir = path.join(workDir, '.agents');
    await mkdir(agentsDir, { recursive: true });
    try {
      await chmod(agentsDir, 0o555);
      // Sanity check: confirm the directory is in fact unwritable in this environment
      // (some filesystems / CI runners ignore chmod on the test user's own directories).
      try {
        await access(path.join(agentsDir, '.write-probe'));
      } catch {
        // expected: the probe file does not exist. We rely on the writeFile inside the
        // deriver to surface EACCES; the access call here is just a placeholder for clarity.
      }
      await expect(deriveSessionContext({ cwd: workDir, branch: 'main', now: NOW, home: workDir })).rejects.toThrow();
    } finally {
      // Restore permissions so afterEach cleanup can remove the directory tree.
      await chmod(agentsDir, 0o755);
    }
  });

  it('throws a detached-HEAD error when the branch is empty', async () => {
    await expect(deriveSessionContext({ cwd: workDir, branch: '', now: NOW, home: workDir })).rejects.toThrow(
      /Detached HEAD/,
    );
  });

  it('throws a detached-HEAD error when the branch is HEAD', async () => {
    await expect(deriveSessionContext({ cwd: workDir, branch: 'HEAD', now: NOW, home: workDir })).rejects.toThrow(
      /Detached HEAD/,
    );
  });

  it('seeds ticket_url and pr_url to null on a fresh compose', async () => {
    await writeProjectPrefs(workDir, 'project:\n  slug: my-project\n');
    const manifest = await deriveSessionContext({ cwd: workDir, branch: 'main', now: NOW, home: workDir });
    expect(manifest.ticket_url).toBeNull();
    expect(manifest.pr_url).toBeNull();
  });

  it('persists --set-ticket-url and a subsequent read returns it', async () => {
    await writeProjectPrefs(workDir, 'project:\n  slug: my-project\n');
    const url = 'https://github.com/owner/repo/issues/783';
    const set = await deriveSessionContext({
      cwd: workDir,
      branch: 'main',
      now: NOW,
      home: workDir,
      mutations: [{ field: 'ticket_url', value: url }],
    });
    expect(set.ticket_url).toBe(url);

    const reread = await deriveSessionContext({ cwd: workDir, branch: 'main', now: NOW, home: workDir });
    expect(reread.ticket_url).toBe(url);
  });

  it('persists --set-pr-url and a subsequent read returns it', async () => {
    await writeProjectPrefs(workDir, 'project:\n  slug: my-project\n');
    const url = 'https://github.com/owner/repo/pull/42';
    const set = await deriveSessionContext({
      cwd: workDir,
      branch: 'main',
      now: NOW,
      home: workDir,
      mutations: [{ field: 'pr_url', value: url }],
    });
    expect(set.pr_url).toBe(url);

    const reread = await deriveSessionContext({ cwd: workDir, branch: 'main', now: NOW, home: workDir });
    expect(reread.pr_url).toBe(url);
  });

  it('resets the field to null on --clear-ticket-url', async () => {
    await writeProjectPrefs(workDir, 'project:\n  slug: my-project\n');
    await deriveSessionContext({
      cwd: workDir,
      branch: 'main',
      now: NOW,
      home: workDir,
      mutations: [{ field: 'ticket_url', value: 'https://github.com/owner/repo/issues/783' }],
    });
    const cleared = await deriveSessionContext({
      cwd: workDir,
      branch: 'main',
      now: NOW,
      home: workDir,
      mutations: [{ field: 'ticket_url', value: null }],
    });
    expect(cleared.ticket_url).toBeNull();
  });

  it('resets the field to null on --clear-pr-url', async () => {
    await writeProjectPrefs(workDir, 'project:\n  slug: my-project\n');
    await deriveSessionContext({
      cwd: workDir,
      branch: 'main',
      now: NOW,
      home: workDir,
      mutations: [{ field: 'pr_url', value: 'https://github.com/owner/repo/pull/42' }],
    });
    const cleared = await deriveSessionContext({
      cwd: workDir,
      branch: 'main',
      now: NOW,
      home: workDir,
      mutations: [{ field: 'pr_url', value: null }],
    });
    expect(cleared.pr_url).toBeNull();
  });

  it('preserves previously stored URLs across a recompose triggered by a stale manifest', async () => {
    await writeProjectPrefs(workDir, 'project:\n  slug: my-project\n');
    const ticketUrl = 'https://github.com/owner/repo/issues/783';
    const prUrl = 'https://github.com/owner/repo/pull/42';

    // Seed a stale manifest (missing the required `platform` field) that nonetheless carries stored
    // URLs. The next derive recomposes because the manifest fails the schema check; carry-forward
    // must rescue the URLs from the prior file.
    const manifestPath = path.join(workDir, '.agents', 'main.branch-manifest.json');
    await mkdir(path.dirname(manifestPath), { recursive: true });
    const stale = {
      ticket_id: null,
      ticket_ref: null,
      project_slug: 'seeded',
      default_branch: 'origin/main',
      branch_name: 'main',
      artifact_base_dir: '/tmp/seeded',
      artifact_paths: { chats: 'chats', devlogs: 'devlogs', plans: 'plans' },
      created_at: '2025-01-01T00:00:00Z',
      ticket_url: ticketUrl,
      pr_url: prUrl,
    };
    await writeFile(manifestPath, JSON.stringify(stale), 'utf8');

    const recomposed = await deriveSessionContext({ cwd: workDir, branch: 'main', now: NOW, home: workDir });
    expect(recomposed.platform).toBe('github');
    expect(recomposed.ticket_url).toBe(ticketUrl);
    expect(recomposed.pr_url).toBe(prUrl);
  });

  it('recomposes with null URLs and warns when the prior manifest is corrupt JSON', async () => {
    await writeProjectPrefs(workDir, 'project:\n  slug: my-project\n');
    const manifestPath = path.join(workDir, '.agents', 'main.branch-manifest.json');
    // A corrupt prior file fails the schema read (forcing a recompose) and then fails carry-forward's
    // own parse. The deriver must fall back to a fresh manifest with null URLs and emit the
    // carry-forward diagnostic so a vanished `ticket_url`/`pr_url` is explainable, not silent.
    await writeFile(manifestPath, '{ not valid json', 'utf8');
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const recomposed = await deriveSessionContext({ cwd: workDir, branch: 'main', now: NOW, home: workDir });
      expect(recomposed.platform).toBe('github');
      expect(recomposed.ticket_url).toBeNull();
      expect(recomposed.pr_url).toBeNull();

      const warningLine = stderrSpy.mock.calls
        .map((call) => call[0])
        .find((arg): arg is string => typeof arg === 'string' && arg.includes('stored URLs not carried forward'));
      expect(warningLine).toMatch(/prior manifest at .* is corrupt; stored URLs not carried forward/);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('recomposes with null URLs when the prior manifest parses as a non-object', async () => {
    await writeProjectPrefs(workDir, 'project:\n  slug: my-project\n');
    const manifestPath = path.join(workDir, '.agents', 'main.branch-manifest.json');
    // Valid JSON that is not a record (a bare number). The schema read rejects it (forcing a
    // recompose) and carry-forward's record guard rejects it, so the fresh null URLs stand.
    await writeFile(manifestPath, '42', 'utf8');

    const recomposed = await deriveSessionContext({ cwd: workDir, branch: 'main', now: NOW, home: workDir });
    expect(recomposed.platform).toBe('github');
    expect(recomposed.ticket_url).toBeNull();
    expect(recomposed.pr_url).toBeNull();
  });

  it('reads a pre-existing manifest lacking the URL fields without recomposing', async () => {
    const manifestPath = path.join(workDir, '.agents', 'main.branch-manifest.json');
    await mkdir(path.dirname(manifestPath), { recursive: true });
    const seeded = {
      ticket_id: null,
      ticket_ref: null,
      project_slug: 'seeded',
      platform: 'github',
      default_branch: 'origin/main',
      branch_name: 'main',
      artifact_base_dir: '/tmp/seeded',
      artifact_paths: { chats: 'chats', devlogs: 'devlogs', plans: 'plans' },
      created_at: '2025-01-01T00:00:00Z',
    };
    await writeFile(manifestPath, JSON.stringify(seeded), 'utf8');

    const result = await deriveSessionContext({ cwd: workDir, branch: 'main', now: NOW, home: workDir });
    expect(result.project_slug).toBe('seeded');
    expect(result.ticket_url).toBeUndefined();

    // No spurious recompose: the on-disk file is byte-identical to what was seeded.
    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toEqual(seeded);
  });
});

// region | Helpers

async function writeProjectPrefs(workDir: string, body: string): Promise<void> {
  const agentsDir = path.join(workDir, '.agents');
  await mkdir(agentsDir, { recursive: true });
  await writeFile(path.join(agentsDir, 'preferences.yaml'), body, 'utf8');
}

// endregion | Helpers
