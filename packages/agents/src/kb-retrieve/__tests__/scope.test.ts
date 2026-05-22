import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveScope } from '../scope.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const PROJECT_KB = join(FIXTURES, 'project-kb');
const VAULT_A = join(FIXTURES, 'vault-a');
const VAULT_B = join(FIXTURES, 'vault-b');
const NOTES_VAULT = join(FIXTURES, 'notes-vault');
const HOME_WITH_DEFAULT = join(FIXTURES, 'home-with-default');
// A home directory with no `.claude/kb.yaml`, so the user-global registry resolves empty.
const HOME_EMPTY = FIXTURES;

describe(resolveScope, () => {
  it('default scope is the discovered KB plus the registry default', async () => {
    const scoped = await resolveScope({ startDir: PROJECT_KB, allKbs: false, home: HOME_EMPTY });

    expect(scoped).toEqual([
      { name: null, path: PROJECT_KB, via: 'discovery' },
      { name: 'vault-a', path: VAULT_A, via: 'registry-default' },
    ]);
  });

  it('--all-kbs widens scope to every registered KB', async () => {
    const scoped = await resolveScope({ startDir: PROJECT_KB, allKbs: true, home: HOME_EMPTY });

    expect(scoped).toEqual([
      { name: null, path: PROJECT_KB, via: 'discovery' },
      { name: 'vault-a', path: VAULT_A, via: 'registry-all' },
      { name: 'vault-b', path: VAULT_B, via: 'registry-all' },
    ]);
  });

  it('returns only the discovered KB when no registry is configured', async () => {
    const scoped = await resolveScope({ startDir: NOTES_VAULT, allKbs: false, home: HOME_EMPTY });

    expect(scoped).toEqual([{ name: null, path: NOTES_VAULT, via: 'discovery' }]);
  });

  it('reads the user-global registry when no project registry exists', async () => {
    const scoped = await resolveScope({ startDir: NOTES_VAULT, allKbs: false, home: HOME_WITH_DEFAULT });

    expect(scoped).toEqual([
      { name: null, path: NOTES_VAULT, via: 'discovery' },
      { name: 'global-vault', path: VAULT_B, via: 'registry-default' },
    ]);
  });

  it('returns an empty scope when neither a .kb root nor a registry is found', async () => {
    const scoped = await resolveScope({ startDir: '/', allKbs: false, home: HOME_EMPTY });

    expect(scoped).toEqual([]);
  });
});
