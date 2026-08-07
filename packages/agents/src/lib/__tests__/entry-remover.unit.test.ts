import { existsSync, lstatSync } from 'node:fs';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { classifyOwnedEntry, describePruneResult, pruneOrphanedEntries, type PruneResult } from '../entry-remover.ts';
import { computeContentHash } from '../manifest.ts';
import type { ManifestEntry } from '../types.ts';

describe(pruneOrphanedEntries, () => {
  let home: string;

  beforeEach(async () => {
    home = path.join(tmpdir(), `agents-test-prune-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(home, { recursive: true });
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  async function writeTracked(relativePath: string, content: string): Promise<ManifestEntry> {
    const fullPath = path.join(home, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
    return { relativePath, contentHash: await computeContentHash(fullPath), linked: false };
  }

  function options(overrides: Partial<{ force: boolean; dryRun: boolean }> = {}): { force: boolean; dryRun: boolean } {
    return { force: false, dryRun: false, ...overrides };
  }

  it('removes an unmodified orphan and omits it from retained', async () => {
    const entry = await writeTracked('skills/gone/SKILL.md', 'body');

    const result = await pruneOrphanedEntries([entry], [], home, options());

    expect(existsSync(path.join(home, entry.relativePath))).toBe(false);
    expect(result.orphans).toEqual([{ entry, verdict: 'remove' }]);
    expect(result.retained).toEqual([]);
  });

  it('leaves an entry whose path is still in the current set', async () => {
    const entry = await writeTracked('skills/kept/SKILL.md', 'body');

    const result = await pruneOrphanedEntries([entry], [entry], home, options());

    expect(existsSync(path.join(home, entry.relativePath))).toBe(true);
    expect(result.orphans).toEqual([]);
  });

  it('retains a user-modified orphan when force is unset', async () => {
    const entry = await writeTracked('scripts/edited.sh', 'original');
    await writeFile(path.join(home, entry.relativePath), 'user edit', 'utf8');

    const result = await pruneOrphanedEntries([entry], [], home, options());

    expect(existsSync(path.join(home, entry.relativePath))).toBe(true);
    expect(result.retained).toEqual([entry]);
    expect(result.orphans).toEqual([{ entry, verdict: 'retain' }]);
  });

  it('removes a user-modified orphan when force is set', async () => {
    const entry = await writeTracked('scripts/edited.sh', 'original');
    await writeFile(path.join(home, entry.relativePath), 'user edit', 'utf8');

    const result = await pruneOrphanedEntries([entry], [], home, options({ force: true }));

    expect(existsSync(path.join(home, entry.relativePath))).toBe(false);
    expect(result.orphans).toEqual([{ entry, verdict: 'remove' }]);
    expect(result.retained).toEqual([]);
  });

  it('drops an already-absent orphan without error', async () => {
    const entry: ManifestEntry = {
      relativePath: 'skills/never/SKILL.md',
      contentHash: 'sha256:absent',
      linked: false,
    };

    const result = await pruneOrphanedEntries([entry], [], home, options());

    expect(result.orphans).toEqual([{ entry, verdict: 'absent' }]);
    expect(result.retained).toEqual([]);
  });

  it('removes a dangling symlink orphan', async () => {
    const target = path.join(home, 'target.sh');
    await writeFile(target, 'content', 'utf8');
    const linkPath = path.join(home, 'scripts', 'linked.sh');
    await mkdir(path.dirname(linkPath), { recursive: true });
    await symlink(target, linkPath);
    await rm(target); // Leave the symlink dangling, as a deleted source would.
    const entry: ManifestEntry = { relativePath: 'scripts/linked.sh', contentHash: 'sha256:linked', linked: true };

    const result = await pruneOrphanedEntries([entry], [], home, options());

    expect(() => lstatSync(linkPath)).toThrow();
    expect(result.orphans).toEqual([{ entry, verdict: 'remove' }]);
  });

  it('records a removal in dry-run without deleting the file', async () => {
    const entry = await writeTracked('skills/gone/SKILL.md', 'body');

    const result = await pruneOrphanedEntries([entry], [], home, options({ dryRun: true }));

    expect(existsSync(path.join(home, entry.relativePath))).toBe(true);
    expect(result.orphans).toEqual([{ entry, verdict: 'remove' }]);
  });
});

describe(describePruneResult, () => {
  const entry = (relativePath: string): ManifestEntry => ({ relativePath, contentHash: 'sha256:x', linked: false });

  it('warns about a kept orphan and reports a removed one, in the order considered', () => {
    const result: PruneResult = {
      orphans: [
        { entry: entry('scripts/edited.sh'), verdict: 'retain' },
        { entry: entry('skills/gone/SKILL.md'), verdict: 'remove' },
      ],
      retained: [entry('scripts/edited.sh')],
    };

    expect(describePruneResult(result, { dryRun: false })).toEqual([
      { level: 'warn', text: '  ⚠️ Keeping modified stale item: scripts/edited.sh' },
      { level: 'info', text: '  🗑️ Removed stale item: skills/gone/SKILL.md' },
    ]);
  });

  it('phrases a removal as pending under dry-run', () => {
    const result: PruneResult = {
      orphans: [{ entry: entry('skills/gone/SKILL.md'), verdict: 'remove' }],
      retained: [],
    };

    expect(describePruneResult(result, { dryRun: true })).toEqual([
      { level: 'info', text: '  [dry-run] Would remove stale item: skills/gone/SKILL.md' },
    ]);
  });

  it('says nothing about an orphan already gone from disk', () => {
    const result: PruneResult = {
      orphans: [{ entry: entry('skills/never/SKILL.md'), verdict: 'absent' }],
      retained: [],
    };

    expect(describePruneResult(result, { dryRun: false })).toEqual([]);
  });
});

describe(classifyOwnedEntry, () => {
  let home: string;

  beforeEach(async () => {
    home = path.join(tmpdir(), `agents-test-classify-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(home, { recursive: true });
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  async function writeTracked(relativePath: string, content: string): Promise<ManifestEntry> {
    const fullPath = path.join(home, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
    return { relativePath, contentHash: await computeContentHash(fullPath), linked: false };
  }

  it('returns remove for a linked entry whose target is gone', async () => {
    const target = path.join(home, 'target.sh');
    await writeFile(target, 'content', 'utf8');
    const linkPath = path.join(home, 'scripts', 'linked.sh');
    await mkdir(path.dirname(linkPath), { recursive: true });
    await symlink(target, linkPath);
    await rm(target); // Leave the symlink dangling, as a deleted source would.
    const entry: ManifestEntry = { relativePath: 'scripts/linked.sh', contentHash: 'sha256:linked', linked: true };

    expect(await classifyOwnedEntry(entry, home, false)).toBe('remove');
  });

  it('returns absent for an unlinked entry that is gone from disk', async () => {
    const entry: ManifestEntry = { relativePath: 'skills/never/SKILL.md', contentHash: 'sha256:absent', linked: false };

    expect(await classifyOwnedEntry(entry, home, false)).toBe('absent');
  });

  it('returns retain for an unlinked user-modified entry when force is unset', async () => {
    const entry = await writeTracked('scripts/edited.sh', 'original');
    await writeFile(path.join(home, entry.relativePath), 'user edit', 'utf8');

    expect(await classifyOwnedEntry(entry, home, false)).toBe('retain');
  });

  it('returns remove for an unlinked user-modified entry when force is set', async () => {
    const entry = await writeTracked('scripts/edited.sh', 'original');
    await writeFile(path.join(home, entry.relativePath), 'user edit', 'utf8');

    expect(await classifyOwnedEntry(entry, home, true)).toBe('remove');
  });

  it('returns remove for an unlinked unmodified entry', async () => {
    const entry = await writeTracked('scripts/clean.sh', 'original');

    expect(await classifyOwnedEntry(entry, home, false)).toBe('remove');
  });
});
