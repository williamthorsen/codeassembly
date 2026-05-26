import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deriveSessionContext, parseArgs, sanitizeBranch } from '../cli.ts';

const NOW = new Date('2026-05-26T02:07:41Z');

describe(parseArgs, () => {
  it('returns null fields when no args are supplied', () => {
    expect(parseArgs([])).toEqual({ branch: null, cwd: null, home: null });
  });

  it('parses --branch, --cwd, and --home as separate-token flags', () => {
    expect(parseArgs(['--branch', 'main', '--cwd', '/tmp/foo', '--home', '/tmp/home'])).toEqual({
      branch: 'main',
      cwd: '/tmp/foo',
      home: '/tmp/home',
    });
  });

  it('parses --branch=value inline form', () => {
    expect(parseArgs(['--branch=main'])).toEqual({ branch: 'main', cwd: null, home: null });
  });

  it('parses --home=value inline form', () => {
    expect(parseArgs(['--home=/tmp/x'])).toEqual({ branch: null, cwd: null, home: '/tmp/x' });
  });

  it('parses --cwd=value inline form', () => {
    expect(parseArgs(['--cwd=/tmp/foo'])).toEqual({ branch: null, cwd: '/tmp/foo', home: null });
  });

  it('throws when --branch has no value', () => {
    expect(() => parseArgs(['--branch'])).toThrow(/--branch requires a value/);
  });

  it('throws when --home has no value', () => {
    expect(() => parseArgs(['--home'])).toThrow(/--home requires a value/);
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
});

// region | Helpers

async function writeProjectPrefs(workDir: string, body: string): Promise<void> {
  const agentsDir = path.join(workDir, '.agents');
  await mkdir(agentsDir, { recursive: true });
  await writeFile(path.join(agentsDir, 'preferences.yaml'), body, 'utf8');
}

// endregion | Helpers
