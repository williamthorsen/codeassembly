import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveScope } from '../scope.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const PROJECT_KB = join(FIXTURES, 'project-kb');
const VAULT_A = join(FIXTURES, 'vault-a');
const VAULT_B = join(FIXTURES, 'vault-b');
const NOTES_VAULT = join(FIXTURES, 'notes-vault');
const MALFORMED_REGISTRY = join(FIXTURES, 'registry.malformed');
const HOME_WITH_DEFAULT = join(FIXTURES, 'home-with-default');
// A home directory with no `.agents/kb.yaml`, so the user-global registry resolves empty.
const HOME_EMPTY = FIXTURES;

describe(resolveScope, () => {
  it('default scope is the discovered KB plus the registry default', async () => {
    const { kbs, registryError } = await resolveScope({ startDir: PROJECT_KB, allKbs: false, home: HOME_EMPTY });

    expect(kbs).toEqual([
      { name: null, path: PROJECT_KB, via: 'discovery' },
      { name: 'vault-a', path: VAULT_A, via: 'registry-default' },
    ]);
    expect(registryError).toBeUndefined();
  });

  it('--all-kbs widens scope to every registered KB', async () => {
    const { kbs } = await resolveScope({ startDir: PROJECT_KB, allKbs: true, home: HOME_EMPTY });

    expect(kbs).toEqual([
      { name: null, path: PROJECT_KB, via: 'discovery' },
      { name: 'vault-a', path: VAULT_A, via: 'registry-all' },
      { name: 'vault-b', path: VAULT_B, via: 'registry-all' },
    ]);
  });

  it('returns only the discovered KB when no registry is configured', async () => {
    const { kbs } = await resolveScope({ startDir: NOTES_VAULT, allKbs: false, home: HOME_EMPTY });

    expect(kbs).toEqual([{ name: null, path: NOTES_VAULT, via: 'discovery' }]);
  });

  it('reads the user-global registry when no project registry exists', async () => {
    const { kbs } = await resolveScope({ startDir: NOTES_VAULT, allKbs: false, home: HOME_WITH_DEFAULT });

    expect(kbs).toEqual([
      { name: null, path: NOTES_VAULT, via: 'discovery' },
      { name: 'global-vault', path: VAULT_B, via: 'registry-default' },
    ]);
  });

  it('returns an empty scope when neither a .kb root nor a registry is found', async () => {
    const { kbs, registryError } = await resolveScope({ startDir: '/', allKbs: false, home: HOME_EMPTY });

    expect(kbs).toEqual([]);
    expect(registryError).toBeUndefined();
  });

  it('degrades a malformed registry to an empty registry and reports the load error', async () => {
    const { kbs, registryError } = await resolveScope({
      startDir: MALFORMED_REGISTRY,
      allKbs: false,
      home: HOME_EMPTY,
    });

    // The malformed `.agents/kb.yaml` yields no registry entries; the discovered `.kb` root still resolves.
    expect(kbs).toEqual([{ name: null, path: MALFORMED_REGISTRY, via: 'discovery' }]);
    expect(registryError).toMatch(/kb\.yaml/);
  });

  it('scopes to a single named store via registry-named when --store is set', async () => {
    const { kbs } = await resolveScope({
      startDir: PROJECT_KB,
      allKbs: false,
      storeName: 'global-vault',
      home: HOME_WITH_DEFAULT,
    });

    expect(kbs).toEqual([{ name: 'global-vault', path: VAULT_B, via: 'registry-named' }]);
  });

  it('suppresses the cwd-walk so a discoverable project-local .kb/ does not enter scope', async () => {
    const { kbs } = await resolveScope({
      startDir: PROJECT_KB,
      allKbs: false,
      storeName: 'global-vault',
      home: HOME_WITH_DEFAULT,
    });

    expect(kbs.some((kb) => kb.path === PROJECT_KB)).toBe(false);
  });

  it('returns an empty scope with storeNotFound when the named store is unregistered', async () => {
    const { kbs, storeNotFound } = await resolveScope({
      startDir: PROJECT_KB,
      allKbs: false,
      storeName: 'no-such-store',
      home: HOME_WITH_DEFAULT,
    });

    expect(kbs).toEqual([]);
    expect(storeNotFound).toBe('no-such-store');
  });
});
