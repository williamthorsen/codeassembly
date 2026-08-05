import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveCaptureTarget } from '../resolve-capture-target.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const VAULT_A = join(FIXTURES, 'vault-a');
const VAULT_B = join(FIXTURES, 'vault-b');
const VAULT_READONLY = join(FIXTURES, 'vault-readonly');
const HOME_WITH_DEFAULT = join(FIXTURES, 'home-with-default');
const HOME_DEFAULT_NAMED = join(FIXTURES, 'home-default-named');
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

  it('resolves the @default sentinel to the configured default_kb', async () => {
    const result = await resolveCaptureTarget({ explicitName: '@default', home: HOME_WITH_DEFAULT });

    expect(result).toEqual({ ok: true, store: { name: 'global-vault', path: VAULT_B } });
  });

  it('treats --store default as a concrete name, resolving the KB named "default" not the sentinel target', async () => {
    const result = await resolveCaptureTarget({ explicitName: 'default', home: HOME_DEFAULT_NAMED });

    expect(result).toEqual({ ok: true, store: { name: 'default', path: VAULT_A } });
  });

  it('resolves @default to the configured default even when a KB named "default" is registered', async () => {
    const result = await resolveCaptureTarget({ explicitName: '@default', home: HOME_DEFAULT_NAMED });

    expect(result).toEqual({ ok: true, store: { name: 'other-vault', path: VAULT_B } });
  });

  it('refuses a readonly default_kb reached via @default', async () => {
    const result = await resolveCaptureTarget({ explicitName: '@default', home: HOME_READONLY_DEFAULT });

    expect(result).toEqual({ ok: false, reason: 'readonly-store', name: 'readonly-default', path: VAULT_READONLY });
  });

  it('returns no-default when @default is given but no default_kb is configured', async () => {
    const result = await resolveCaptureTarget({ explicitName: '@default', home: HOME_EMPTY });

    expect(result).toEqual({ ok: false, reason: 'no-default' });
  });

  it('carries the registry error when @default names an unresolvable default_kb', async () => {
    const result = await resolveCaptureTarget({ explicitName: '@default', home: HOME_UNRESOLVABLE_DEFAULT });

    expect(result).toEqual({
      ok: false,
      reason: 'no-default',
      registryError: expect.stringMatching(/default_kb "ghost" does not match any registered KB/),
    });
  });

  it('refuses an omitted --store with missing-store, listing the registered stores and the default', async () => {
    const result = await resolveCaptureTarget({ explicitName: null, home: HOME_WITH_DEFAULT });

    expect(result).toEqual({
      ok: false,
      reason: 'missing-store',
      registeredStores: ['global-vault', 'named-vault-a'],
      defaultName: 'global-vault',
    });
  });

  it('returns missing-store with no stores and no default when the registry is empty', async () => {
    const result = await resolveCaptureTarget({ explicitName: null, home: HOME_EMPTY });

    expect(result).toEqual({ ok: false, reason: 'missing-store', registeredStores: [] });
  });

  it('carries the registry error in missing-store when the registry is unresolvable', async () => {
    const result = await resolveCaptureTarget({ explicitName: null, home: HOME_UNRESOLVABLE_DEFAULT });

    expect(result).toEqual({
      ok: false,
      reason: 'missing-store',
      registeredStores: [],
      registryError: expect.stringMatching(/default_kb "ghost" does not match any registered KB/),
    });
  });
});
