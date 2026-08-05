import { describe, expect, it } from 'vitest';

import { resolveMemoryStore } from '../resolve-memory-store.ts';

const PROJECTS_ROOT = '/home/me/.claude/projects';

/** Resolves each store slug to a repo path from a fixture map, standing in for the filesystem probe. */
function makeRepoResolver(repos: Record<string, string>): (slug: string) => Promise<string | null> {
  return (slug) => Promise.resolve(repos[slug] ?? null);
}

describe(resolveMemoryStore, () => {
  it('resolves a store directory name without probing for a repo', async () => {
    let probes = 0;

    const result = await resolveMemoryStore({
      requested: '-Users-me-repos-app',
      memoryStores: ['-Users-me-repos-app', '-Users-me-repos-web'],
      projectsRoot: PROJECTS_ROOT,
      resolveRepo: () => {
        probes++;
        return Promise.resolve(null);
      },
    });

    expect(result).toEqual({ ok: true, memoryStore: '-Users-me-repos-app' });
    expect(probes).toBe(0);
  });

  it('resolves the label a store displays to that store', async () => {
    const result = await resolveMemoryStore({
      requested: 'app',
      memoryStores: ['-Users-me-repos-app', '-Users-me-repos-web'],
      projectsRoot: PROJECTS_ROOT,
      resolveRepo: makeRepoResolver({
        '-Users-me-repos-app': '/Users/me/repos/app',
        '-Users-me-repos-web': '/Users/me/repos/web',
      }),
    });

    expect(result).toEqual({ ok: true, memoryStore: '-Users-me-repos-app' });
  });

  it('resolves a store with no live repo by the slug it falls back to displaying', async () => {
    const result = await resolveMemoryStore({
      requested: '-Users-me-repos-gone',
      memoryStores: ['-Users-me-repos-gone'],
      projectsRoot: PROJECTS_ROOT,
      resolveRepo: makeRepoResolver({}),
    });

    expect(result).toEqual({ ok: true, memoryStore: '-Users-me-repos-gone' });
  });

  it('fails with no-such-memory-store when the name matches no store or label', async () => {
    const result = await resolveMemoryStore({
      requested: 'nowhere',
      memoryStores: ['-Users-me-repos-app'],
      projectsRoot: PROJECTS_ROOT,
      resolveRepo: makeRepoResolver({ '-Users-me-repos-app': '/Users/me/repos/app' }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no-such-memory-store');
    expect(result.message).toContain('nowhere');
  });

  it('fails with ambiguous-memory-store when two stores share a label, naming both', async () => {
    const result = await resolveMemoryStore({
      requested: 'app',
      memoryStores: ['-Users-me-clients-acme-app', '-Users-me-repos-app'],
      projectsRoot: PROJECTS_ROOT,
      resolveRepo: makeRepoResolver({
        '-Users-me-clients-acme-app': '/Users/me/clients/acme/app',
        '-Users-me-repos-app': '/Users/me/repos/app',
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('ambiguous-memory-store');
    expect(result.message).toContain('-Users-me-clients-acme-app');
    expect(result.message).toContain('-Users-me-repos-app');
  });
});
