import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveKb } from '../resolve-kb.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const PROJECT_KB = join(FIXTURES, 'project-kb');
const DISCOVERED_KB = join(FIXTURES, 'discovered-kb');
const VAULT_A = join(FIXTURES, 'vault-a');
const VAULT_B = join(FIXTURES, 'vault-b');
const HOME_WITH_DEFAULT = join(FIXTURES, 'home-with-default');
const HOME_MALFORMED = join(FIXTURES, 'malformed-registry');
// A home directory with no `.agents/kb.yaml`, so the user-global registry resolves empty.
const HOME_EMPTY = FIXTURES;

describe(resolveKb, () => {
  it('returns the discovered KB when one is found, preferring it over registry-default', async () => {
    const result = await resolveKb({ startDir: PROJECT_KB, explicitKb: null, home: HOME_EMPTY });

    expect(result).toEqual({
      ok: true,
      kb: { name: null, path: PROJECT_KB, source: 'discovered' },
    });
  });

  it('annotates a discovered KB with its registry name when its path matches a registered entry', async () => {
    // VAULT_A is registered in HOME_WITH_DEFAULT as `named-vault-a`. Discovery from VAULT_A returns VAULT_A,
    // whose absolute path then matches the registry entry, so `name` is populated rather than null.
    const result = await resolveKb({ startDir: VAULT_A, explicitKb: null, home: HOME_WITH_DEFAULT });

    expect(result).toEqual({
      ok: true,
      kb: { name: 'named-vault-a', path: VAULT_A, source: 'discovered' },
    });
  });

  it('returns name: null for a discovered KB whose path is not in the registry', async () => {
    // DISCOVERED_KB is not registered in HOME_WITH_DEFAULT, so the discovered match has no registry entry
    // and the name falls back to null.
    const result = await resolveKb({ startDir: DISCOVERED_KB, explicitKb: null, home: HOME_WITH_DEFAULT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kb).toEqual({ name: null, path: DISCOVERED_KB, source: 'discovered' });
    }
  });

  it('returns the registry default when no .kb/ is discovered', async () => {
    const result = await resolveKb({ startDir: FIXTURES, explicitKb: null, home: HOME_WITH_DEFAULT });

    expect(result).toEqual({
      ok: true,
      kb: { name: 'global-vault', path: VAULT_B, source: 'registry-default' },
    });
  });

  it('returns the explicit KB when --kb names a registered entry, overriding discovery and default', async () => {
    const result = await resolveKb({ startDir: PROJECT_KB, explicitKb: 'vault-b', home: HOME_EMPTY });

    expect(result).toEqual({
      ok: true,
      kb: { name: 'vault-b', path: VAULT_B, source: 'explicit' },
    });
  });

  it('returns no-kb-resolvable when --kb names an entry that does not exist', async () => {
    const result = await resolveKb({ startDir: PROJECT_KB, explicitKb: 'nonexistent', home: HOME_EMPTY });

    expect(result).toEqual({ ok: false, reason: 'no-kb-resolvable', requestedKb: 'nonexistent' });
  });

  it('returns no-kb-resolvable when no .kb/, no default, and no explicit KB is available', async () => {
    const result = await resolveKb({ startDir: '/', explicitKb: null, home: HOME_EMPTY });

    expect(result).toEqual({ ok: false, reason: 'no-kb-resolvable', requestedKb: null });
  });

  it('uses the discovered KB even when a registry default is also configured', async () => {
    const result = await resolveKb({ startDir: DISCOVERED_KB, explicitKb: null, home: HOME_WITH_DEFAULT });

    expect(result).toEqual({
      ok: true,
      kb: { name: null, path: DISCOVERED_KB, source: 'discovered' },
    });
  });

  it('degrades a malformed user-global registry to an empty config rather than throwing', async () => {
    // HOME_MALFORMED contains a syntactically invalid `.agents/kb.yaml`. The helper must swallow the parse
    // error and surface a structured result — here, the no-kb-resolvable failure for a startDir with no `.kb/`
    // marker — rather than letting the throw escape `resolveKb`.
    const result = await resolveKb({ startDir: '/', explicitKb: null, home: HOME_MALFORMED });

    expect(result).toEqual({ ok: false, reason: 'no-kb-resolvable', requestedKb: null });
  });

  it('degrades a malformed user-global registry while still honoring a discovered KB', async () => {
    // Even with a malformed registry, discovery should still succeed and the result should not throw.
    const result = await resolveKb({ startDir: DISCOVERED_KB, explicitKb: null, home: HOME_MALFORMED });

    expect(result).toEqual({
      ok: true,
      kb: { name: null, path: DISCOVERED_KB, source: 'discovered' },
    });
  });
});
