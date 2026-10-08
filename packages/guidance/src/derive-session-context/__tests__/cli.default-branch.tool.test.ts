import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deriveSessionContext } from '../cli.ts';

const NOW = new Date('2026-05-26T02:07:41Z');

describe('default-branch invariant', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'derive-session-context-default-branch-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it.each([
    { flag: '--set-ticket-url', field: 'ticket_url', url: 'https://github.com/owner/repo/issues/783' },
    { flag: '--set-pr-url', field: 'pr_url', url: 'https://github.com/owner/repo/pull/42' },
  ] as const)('refuses $flag on the default branch and reports it', async ({ field, url }) => {
    await writeProjectPrefs(workDir, 'project:\n  slug: my-project\n');
    {
      using stdio = captureStdio();
      const result = await deriveSessionContext({
        cwd: workDir,
        branch: 'main',
        now: NOW,
        home: workDir,
        mutations: [{ field, value: url }],
      });
      expect(result[field]).toBeNull();
      expect(stdio.stderr).toMatch(new RegExp(`refusing to store ${field} on default branch main`));
    }

    const reread = await deriveSessionContext({ cwd: workDir, branch: 'main', now: NOW, home: workDir });
    expect(reread[field]).toBeNull();
  });

  it('leaves a clean default-branch manifest untouched when a set is refused', async () => {
    await writeProjectPrefs(workDir, 'project:\n  slug: my-project\n');
    const manifestPath = path.join(workDir, '.agents', 'main.branch-manifest.json');
    await deriveSessionContext({ cwd: workDir, branch: 'main', now: NOW, home: workDir });
    const before = await readFile(manifestPath, 'utf8');

    await deriveSessionContext({
      cwd: workDir,
      branch: 'main',
      now: NOW,
      home: workDir,
      mutations: [{ field: 'ticket_url', value: 'https://github.com/owner/repo/issues/783' }],
    });

    expect(await readFile(manifestPath, 'utf8')).toBe(before);
  });

  it.each([
    { flag: '--clear-ticket-url', field: 'ticket_url' },
    { flag: '--clear-pr-url', field: 'pr_url' },
  ] as const)('still accepts $flag on the default branch', async ({ field }) => {
    await writeProjectPrefs(workDir, 'project:\n  slug: my-project\n');
    const cleared = await deriveSessionContext({
      cwd: workDir,
      branch: 'main',
      now: NOW,
      home: workDir,
      mutations: [{ field, value: null }],
    });
    expect(cleared[field]).toBeNull();
  });

  it('repairs a default-branch manifest that already contains stored URLs, in the file', async () => {
    await writeProjectPrefs(workDir, 'project:\n  slug: my-project\n');
    const manifestPath = path.join(workDir, '.agents', 'main.branch-manifest.json');
    await mkdir(path.dirname(manifestPath), { recursive: true });
    const polluted = {
      ticket_id: null,
      ticket_ref: null,
      project_slug: 'seeded',
      scm: 'github',
      default_branch: 'origin/main',
      branch_name: 'main',
      artifact_base_dir: '/tmp/seeded',
      artifact_paths: { chats: 'chats', devlogs: 'devlogs', plans: 'plans' },
      created_at: '2025-01-01T00:00:00Z',
      ticket_url: 'https://github.com/owner/repo/issues/411',
      pr_url: 'https://github.com/owner/repo/pull/42',
    };
    await writeFile(manifestPath, JSON.stringify(polluted), 'utf8');

    using stdio = captureStdio();
    const result = await deriveSessionContext({ cwd: workDir, branch: 'main', now: NOW, home: workDir });
    expect(stdio.stderr).toMatch(/cleared ticket_url stored on default branch main/);
    expect(stdio.stderr).toMatch(/cleared pr_url stored on default branch main/);
    expect(result.ticket_url).toBeNull();
    expect(result.pr_url).toBeNull();

    // The repair is durable, not a mask over the emitted JSON: The file no longer contains the values.
    const onDisk: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(onDisk).toMatchObject({ ticket_url: null, pr_url: null });
  });

  it.each([
    { field: 'default_branch', malformed: { default_branch: null } },
    { field: 'branch_name', malformed: { branch_name: 42 } },
  ] as const)('recomposes rather than throwing when $field is wrong-typed', async ({ malformed }) => {
    await writeProjectPrefs(workDir, 'project:\n  slug: my-project\n');
    const manifestPath = path.join(workDir, '.agents', 'main.branch-manifest.json');
    await mkdir(path.dirname(manifestPath), { recursive: true });
    const seeded = {
      ticket_id: null,
      ticket_ref: null,
      project_slug: 'seeded',
      scm: 'github',
      default_branch: 'origin/main',
      branch_name: 'main',
      artifact_base_dir: '/tmp/seeded',
      artifact_paths: { chats: 'chats', devlogs: 'devlogs', plans: 'plans' },
      created_at: '2025-01-01T00:00:00Z',
      ...malformed,
    };
    await writeFile(manifestPath, JSON.stringify(seeded), 'utf8');

    const result = await deriveSessionContext({ cwd: workDir, branch: 'main', now: NOW, home: workDir });
    expect(result.default_branch).toBe('origin/main');
    expect(result.branch_name).toBe('main');
    expect(result.project_slug).toBe('my-project');
  });

  it('drops flag-written URLs recorded in explicit_urls on the default branch', async () => {
    await writeProjectPrefs(workDir, 'project:\n  slug: my-project\n');
    const manifestPath = path.join(workDir, '.agents', 'main.branch-manifest.json');
    await mkdir(path.dirname(manifestPath), { recursive: true });
    const explicitUrls = {
      ticket_url: 'https://github.com/owner/repo/issues/411',
      pr_url: 'https://github.com/owner/repo/pull/42',
    };
    await writeFile(manifestPath, JSON.stringify({ ...explicitUrls, explicit_urls: explicitUrls }), 'utf8');

    using _stdio = captureStdio();
    const recomposed = await deriveSessionContext({ cwd: workDir, branch: 'main', now: NOW, home: workDir });
    expect(recomposed.ticket_url).toBeNull();
    expect(recomposed.pr_url).toBeNull();
    expect(recomposed.explicit_urls).toEqual({});
    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toEqual(recomposed);
  });

  it('follows the configured default branch rather than the literal main', async () => {
    await writeProjectPrefs(
      workDir,
      'project:\n  slug: my-project\nrepository:\n  default_remote:\n    default_branch: trunk\n',
    );
    const url = 'https://github.com/owner/repo/issues/783';

    const onTrunk = await deriveSessionContext({
      cwd: workDir,
      branch: 'trunk',
      now: NOW,
      home: workDir,
      mutations: [{ field: 'ticket_url', value: url }],
    });
    expect(onTrunk.ticket_url).toBeNull();

    const onMain = await deriveSessionContext({
      cwd: workDir,
      branch: 'main',
      now: NOW,
      home: workDir,
      mutations: [{ field: 'ticket_url', value: url }],
    });
    expect(onMain.ticket_url).toBe(url);
  });

  it('strips only the remote from a slashed default branch', async () => {
    await writeProjectPrefs(
      workDir,
      'project:\n  slug: my-project\nrepository:\n  default_remote:\n    default_branch: release/2.x\n',
    );
    const result = await deriveSessionContext({
      cwd: workDir,
      branch: 'release/2.x',
      now: NOW,
      home: workDir,
      mutations: [{ field: 'ticket_url', value: 'https://github.com/owner/repo/issues/783' }],
    });
    expect(result.default_branch).toBe('origin/release/2.x');
    expect(result.ticket_url).toBeNull();
  });
});

// region | Helpers

/** Writes `body` as the project's `.agents/preferences.yaml` under `workDir`. */
async function writeProjectPrefs(workDir: string, body: string): Promise<void> {
  const agentsDir = path.join(workDir, '.agents');
  await mkdir(agentsDir, { recursive: true });
  await writeFile(path.join(agentsDir, 'preferences.yaml'), body, 'utf8');
}

// endregion | Helpers
