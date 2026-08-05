import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveStoreByName } from '../resolve-store-by-name.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const VAULT_A = join(FIXTURES, 'vault-a');
const VAULT_READONLY = join(FIXTURES, 'vault-readonly');
const HOME_WITH_DEFAULT = join(FIXTURES, 'home-with-default');
const HOME_READONLY_NAMED = join(FIXTURES, 'home-readonly-named');
const HOME_UNRESOLVABLE_DEFAULT = join(FIXTURES, 'home-unresolvable-default');

describe(resolveStoreByName, () => {
  it('resolves a registered store by name', async () => {
    const result = await resolveStoreByName({ name: 'named-vault-a', home: HOME_WITH_DEFAULT });

    expect(result).toEqual({ ok: true, store: { name: 'named-vault-a', path: VAULT_A } });
  });

  it('fails with not-registered when no entry matches the name', async () => {
    const result = await resolveStoreByName({ name: 'no-such-store', home: HOME_WITH_DEFAULT });

    expect(result).toEqual({ ok: false, reason: 'not-registered', requestedName: 'no-such-store' });
  });

  it('surfaces the registry-load error in its not-registered outcome when the registry fails to load', async () => {
    // `home-unresolvable-default` declares `real`, but its unresolvable `default_kb` makes the load throw and degrade
    // to an empty registry, so a declared name still resolves to not-registered.
    const result = await resolveStoreByName({ name: 'real', home: HOME_UNRESOLVABLE_DEFAULT });

    expect(result).toEqual({
      ok: false,
      reason: 'not-registered',
      requestedName: 'real',
      registryError: expect.stringMatching(/default_kb "ghost" does not match any registered KB/),
    });
  });

  it('refuses a store registered readonly', async () => {
    const result = await resolveStoreByName({ name: 'readonly-named', home: HOME_READONLY_NAMED });

    expect(result).toEqual({ ok: false, reason: 'readonly-store', name: 'readonly-named', path: VAULT_READONLY });
  });

  it('does not rescue an unregistered name from a discoverable project-local .kb/', async () => {
    // project-kb has a discoverable `.kb/` that resolveWritableKb would walk into. resolveStoreByName matches only
    // registry names, so an unregistered name fails rather than silently landing in the discovered store.
    const result = await resolveStoreByName({
      name: 'unregistered-name',
      projectDir: join(FIXTURES, 'project-kb'),
      home: FIXTURES,
    });

    expect(result).toEqual({ ok: false, reason: 'not-registered', requestedName: 'unregistered-name' });
  });
});
