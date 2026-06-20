import { existsSync, lstatSync } from 'node:fs';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computeContentHash } from '../manifest.ts';
import { pruneOrphanedEntries } from '../orphan-pruner.ts';
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
    expect(result.removedPaths).toEqual([entry.relativePath]);
    expect(result.retained).toEqual([]);
  });

  it('leaves an entry whose path is still in the current set', async () => {
    const entry = await writeTracked('skills/kept/SKILL.md', 'body');

    const result = await pruneOrphanedEntries([entry], [entry], home, options());

    expect(existsSync(path.join(home, entry.relativePath))).toBe(true);
    expect(result.removedPaths).toEqual([]);
  });

  it('retains a user-modified orphan when force is unset', async () => {
    const entry = await writeTracked('scripts/edited.sh', 'original');
    await writeFile(path.join(home, entry.relativePath), 'user edit', 'utf8');

    const result = await pruneOrphanedEntries([entry], [], home, options());

    expect(existsSync(path.join(home, entry.relativePath))).toBe(true);
    expect(result.retained).toEqual([entry]);
    expect(result.removedPaths).toEqual([]);
  });

  it('removes a user-modified orphan when force is set', async () => {
    const entry = await writeTracked('scripts/edited.sh', 'original');
    await writeFile(path.join(home, entry.relativePath), 'user edit', 'utf8');

    const result = await pruneOrphanedEntries([entry], [], home, options({ force: true }));

    expect(existsSync(path.join(home, entry.relativePath))).toBe(false);
    expect(result.removedPaths).toEqual([entry.relativePath]);
    expect(result.retained).toEqual([]);
  });

  it('drops an already-absent orphan without error', async () => {
    const entry: ManifestEntry = {
      relativePath: 'skills/never/SKILL.md',
      contentHash: 'sha256:absent',
      linked: false,
    };

    const result = await pruneOrphanedEntries([entry], [], home, options());

    expect(result.removedPaths).toEqual([entry.relativePath]);
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
    expect(result.removedPaths).toEqual([entry.relativePath]);
  });

  it('records a removal in dry-run without deleting the file', async () => {
    const entry = await writeTracked('skills/gone/SKILL.md', 'body');

    const result = await pruneOrphanedEntries([entry], [], home, options({ dryRun: true }));

    expect(existsSync(path.join(home, entry.relativePath))).toBe(true);
    expect(result.removedPaths).toEqual([entry.relativePath]);
  });
});
