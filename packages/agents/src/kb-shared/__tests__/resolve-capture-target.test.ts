import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveCaptureTarget } from '../resolve-capture-target.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const VAULT_A = join(FIXTURES, 'vault-a');
const VAULT_B = join(FIXTURES, 'vault-b');
const VAULT_READONLY = join(FIXTURES, 'vault-readonly');
const HOME_WITH_DEFAULT = join(FIXTURES, 'home-with-default');
const HOME_READONLY_DEFAULT = join(FIXTURES, 'home-readonly-default');
const HOME_UNRESOLVABLE_DEFAULT = join(FIXTURES, 'home-unresolvable-default');
// A home directory with no `.agents/kb.yaml`, so the user-global registry resolves empty.
const HOME_EMPTY = FIXTURES;

describe(resolveCaptureTarget, () => {
  it('resolves an explicit --store by registry name', async () => {
    const result = await resolveCaptureTarget({ explicitName: 'named-vault-a', home: HOME_WITH_DEFAULT });

    expect(result).toEqual({ ok: true, store: { name: 'named-vault-a', path: VAULT_A } });
  });

  it('returns not-registered when the explicit name matches no entry', async () => {
    const result = await resolveCaptureTarget({ explicitName: 'no-such-store', home: HOME_WITH_DEFAULT });

    expect(result).toEqual({ ok: false, reason: 'not-registered', requestedName: 'no-such-store' });
  });

  it('falls back to the default_kb when no explicit name is given', async () => {
    const result = await resolveCaptureTarget({ explicitName: null, home: HOME_WITH_DEFAULT });

    expect(result).toEqual({ ok: true, store: { name: 'global-vault', path: VAULT_B } });
  });

  it('refuses a readonly default_kb', async () => {
    const result = await resolveCaptureTarget({ explicitName: null, home: HOME_READONLY_DEFAULT });

    expect(result).toEqual({ ok: false, reason: 'readonly-store', name: 'readonly-default', path: VAULT_READONLY });
  });

  it('returns no-default when no explicit name is given and no default_kb is configured', async () => {
    const result = await resolveCaptureTarget({ explicitName: null, home: HOME_EMPTY });

    expect(result).toEqual({ ok: false, reason: 'no-default' });
  });

  it('carries the registry error when default_kb is unresolvable', async () => {
    const result = await resolveCaptureTarget({ explicitName: null, home: HOME_UNRESOLVABLE_DEFAULT });

    expect(result).toEqual({
      ok: false,
      reason: 'no-default',
      registryError: expect.stringMatching(/default_kb "ghost" does not match any registered KB/),
    });
  });
});
