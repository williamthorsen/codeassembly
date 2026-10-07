import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deriveSessionContext } from '../cli.ts';

const NOW = new Date('2026-05-26T02:07:41Z');
const LATER = new Date('2026-06-01T00:00:00Z');

const BASE_A = 'https://a.atlassian.net/browse/';
const BASE_B = 'https://b.atlassian.net/browse/';

describe('recompose on every invocation', () => {
  let workDir: string;
  let homeDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'derive-session-context-recompose-'));
    homeDir = await mkdtemp(path.join(tmpdir(), 'derive-session-context-recompose-home-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
  });

  it('follows a change to the project ticket_ref_prefix', async () => {
    await writePrefs(workDir, "project:\n  ticket_ref_prefix: '#'\n");
    const before = await deriveSessionContext({ cwd: workDir, branch: '100', now: NOW, home: homeDir });
    expect(before.ticket_ref).toBe('#100');

    await writePrefs(workDir, "project:\n  ticket_ref_prefix: 'ABC-'\n");
    const after = await deriveSessionContext({ cwd: workDir, branch: '100', now: LATER, home: homeDir });
    expect(after.ticket_id).toBe('ABC-100');
    expect(after.ticket_ref).toBe('ABC-100');
    expect(after.created_at).toBe(before.created_at);
    expect(JSON.parse(await readFile(manifestPathFor(workDir, '100'), 'utf8'))).toEqual(after);
  });

  it('follows a change to the global preferences file', async () => {
    await writePrefs(homeDir, 'project:\n  slug: first\n');
    await deriveSessionContext({ cwd: workDir, branch: 'add-cache', now: NOW, home: homeDir });

    await writePrefs(homeDir, 'project:\n  slug: second\n');
    const after = await deriveSessionContext({ cwd: workDir, branch: 'add-cache', now: NOW, home: homeDir });
    expect(after.project_slug).toBe('second');
  });

  it('re-seeds a ticket_url that no flag wrote when ticket.base_url changes', async () => {
    await writePrefs(workDir, `ticket:\n  base_url: ${BASE_A}\n`);
    const before = await deriveSessionContext({ cwd: workDir, branch: 'MAC-1', now: NOW, home: homeDir });
    expect(before.ticket_url).toBe(`${BASE_A}MAC-1`);

    await writePrefs(workDir, `ticket:\n  base_url: ${BASE_B}\n`);
    const after = await deriveSessionContext({ cwd: workDir, branch: 'MAC-1', now: NOW, home: homeDir });
    expect(after.ticket_url).toBe(`${BASE_B}MAC-1`);
    expect(after.explicit_urls).toEqual({});
  });

  it.each([
    { flag: '--set-ticket-url', field: 'ticket_url', value: 'https://github.com/owner/repo/issues/9' },
    { flag: '--set-pr-url', field: 'pr_url', value: 'https://github.com/owner/repo/pull/9' },
    { flag: '--clear-ticket-url', field: 'ticket_url', value: null },
  ] as const)('keeps the value written by $flag across a preferences change', async ({ field, value }) => {
    await writePrefs(workDir, `ticket:\n  base_url: ${BASE_A}\n`);
    await deriveSessionContext({
      cwd: workDir,
      branch: 'MAC-1',
      now: NOW,
      home: homeDir,
      mutations: [{ field, value }],
    });

    await writePrefs(workDir, `ticket:\n  base_url: ${BASE_B}\n`);
    const after = await deriveSessionContext({ cwd: workDir, branch: 'MAC-1', now: NOW, home: homeDir });
    expect(after[field]).toBe(value);
    expect(after.explicit_urls).toEqual({ [field]: value });
  });

  it('does not record a legacy stored URL that equals the composed one, so it follows the preferences', async () => {
    await writePrefs(workDir, `ticket:\n  base_url: ${BASE_A}\n`);
    const manifestPath = manifestPathFor(workDir, 'MAC-1');
    await writeFile(manifestPath, JSON.stringify({ ticket_url: `${BASE_A}MAC-1` }), 'utf8');

    const migrated = await deriveSessionContext({ cwd: workDir, branch: 'MAC-1', now: NOW, home: homeDir });
    expect(migrated.explicit_urls).toEqual({});

    await writePrefs(workDir, `ticket:\n  base_url: ${BASE_B}\n`);
    const after = await deriveSessionContext({ cwd: workDir, branch: 'MAC-1', now: NOW, home: homeDir });
    expect(after.ticket_url).toBe(`${BASE_B}MAC-1`);
  });

  it('does not rewrite the file when its content is unchanged', async () => {
    await writePrefs(workDir, 'project:\n  slug: my-project\n');
    const manifestPath = manifestPathFor(workDir, 'add-cache');
    const first = await deriveSessionContext({ cwd: workDir, branch: 'add-cache', now: NOW, home: homeDir });
    const before = await stat(manifestPath);
    const beforeText = await readFile(manifestPath, 'utf8');

    const second = await deriveSessionContext({ cwd: workDir, branch: 'add-cache', now: LATER, home: homeDir });
    expect(second).toEqual(first);
    expect(await readFile(manifestPath, 'utf8')).toBe(beforeText);
    expect((await stat(manifestPath)).mtimeMs).toBe(before.mtimeMs);
  });
});

// region | Helpers

/** Returns the canonical manifest path for `branch` under `workDir`. */
function manifestPathFor(workDir: string, branch: string): string {
  return path.join(workDir, '.agents', `${branch}.branch-manifest.json`);
}

/** Writes `body` as `.agents/preferences.yaml` under `rootDir`, a project root or a home directory. */
async function writePrefs(rootDir: string, body: string): Promise<void> {
  const agentsDir = path.join(rootDir, '.agents');
  await mkdir(agentsDir, { recursive: true });
  await writeFile(path.join(agentsDir, 'preferences.yaml'), body, 'utf8');
}

// endregion | Helpers
