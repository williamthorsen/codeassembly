import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { StoreVisibility } from '../../config/config-schema.ts';
import { makeStore } from '../../test-utils/make-store.ts';
import type { KbRegistry } from '../../types.ts';
import type { ForeignStore } from '../../vault-integrity/check-vault-integrity.ts';
import { collectStorePrefixes, resolveForeignStores } from '../resolve-foreign-stores.ts';

describe(collectStorePrefixes, () => {
  it('collects each qualified store once and ignores bare links', () => {
    const notes = [
      { body: 'See [[fde:One]] and [[fde:Two]].' },
      { body: 'Also [[ops:Three]], plus a local [[Four]].' },
    ];

    expect([...collectStorePrefixes(notes)].toSorted()).toEqual(['fde', 'ops']);
  });

  it('ignores a store-shaped prefix inside fenced or inline code', () => {
    const notes = [{ body: '```\n[[fenced:One]]\n```\n\nand `[[inline:Two]]` in prose.' }];

    expect([...collectStorePrefixes(notes)]).toEqual([]);
  });
});

describe(resolveForeignStores, () => {
  it('resolves a permitted store to an index of its basenames', async () => {
    const target = await makeStore({
      'content/Shared assertion.md': 'body',
      '.kb/config.yaml': 'visibility: shared\n',
    });

    const store = await resolveOne('fde', makeRegistry({ fde: target }), 'private');

    expect(store.status).toBe('resolved');
    if (store.status !== 'resolved') return;
    expect(store.index.get('Shared assertion')).toEqual(new Set(['content/Shared assertion.md']));
  });

  it('resolves a store of equal visibility', async () => {
    const target = await makeStore({ 'content/Sibling.md': 'body' });

    expect((await resolveOne('journal', makeRegistry({ journal: target }), 'private')).status).toBe('resolved');
  });

  it('reports a name that matches no registry entry as unknown', async () => {
    expect((await resolveOne('nowhere', makeRegistry({}), 'private')).status).toBe('unknown');
  });

  it('reports a registered store whose path is absent as unavailable', async () => {
    const registry = makeRegistry({ fde: join(await makeStore({}), 'not-here') });

    expect((await resolveOne('fde', registry, 'private')).status).toBe('unavailable');
  });

  it('reports a store carrying an unloadable config as unavailable rather than throwing', async () => {
    const target = await makeStore({ '.kb/config.yaml': 'visibility: public\n' });

    expect((await resolveOne('fde', makeRegistry({ fde: target }), 'private')).status).toBe('unavailable');
  });

  it('reports a less shareable store as disallowed, carrying its visibility', async () => {
    const target = await makeStore({ 'content/Secret.md': 'body', '.kb/config.yaml': 'visibility: private\n' });

    const store = await resolveOne('journal', makeRegistry({ journal: target }), 'shared');

    expect(store).toEqual({ status: 'disallowed', visibility: 'private' });
  });

  it('resolves each named store once', async () => {
    const first = await makeStore({ 'content/One.md': 'body', '.kb/config.yaml': 'visibility: shared\n' });
    const second = await makeStore({ 'content/Two.md': 'body', '.kb/config.yaml': 'visibility: shared\n' });

    const resolved = await resolveForeignStores({
      prefixes: ['fde', 'ops', 'fde'],
      registry: makeRegistry({ fde: first, ops: second }),
      sourceVisibility: 'private',
    });

    expect(resolved.keys().toArray().toSorted()).toEqual(['fde', 'ops']);
  });
});

// region | Helpers

/** Builds a merged-registry stand-in from a `name → path` map. */
function makeRegistry(paths: Record<string, string>): KbRegistry {
  return {
    entries: Object.entries(paths).map(([name, path]) => ({ name, path, source: 'user' })),
    sources: {},
  };
}

/** Resolves a single prefix, returning the entry `resolveForeignStores` recorded for it. */
async function resolveOne(
  prefix: string,
  registry: KbRegistry,
  sourceVisibility: StoreVisibility,
): Promise<ForeignStore> {
  const resolved = await resolveForeignStores({ prefixes: [prefix], registry, sourceVisibility });
  const store = resolved.get(prefix);
  if (store === undefined) throw new Error(`no entry resolved for "${prefix}"`);
  return store;
}

// endregion | Helpers
