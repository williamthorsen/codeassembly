import { tryLoadKbRegistry } from '@codeassembly/kb/discovery';

import { resolveStoreByName, type ResolveStoreOutcome } from './resolve-store-by-name.ts';

/**
 * The capture resolution outcome: an explicit-or-default resolved store, or a categorical failure. Extends
 * `resolveStoreByName`'s outcome with `no-default`, returned when no `--store` was given and the registry declares no
 * usable `default_kb`. It carries the registry-load error when one occurred, so an unresolvable `default_kb` surfaces
 * its cause rather than masquerading as a plain missing default.
 */
export type ResolveCaptureTargetOutcome =
  | ResolveStoreOutcome
  | { ok: false; reason: 'no-default'; registryError?: string };

/**
 * Resolves the store a capture writes into: an explicit `--store` name resolves by registry name (delegating to
 * `resolveStoreByName`), and its absence falls back to the registry's resolved `default_kb`. A readonly default is
 * refused like any readonly store; when no default is configured the result is `no-default`.
 *
 * `home` overrides the directory the user-global `kb.yaml` is read from; it defaults to the real `$HOME` and exists
 * so tests can isolate registry resolution from the developer's environment.
 */
export async function resolveCaptureTarget(input: {
  explicitName: string | null;
  home?: string;
}): Promise<ResolveCaptureTargetOutcome> {
  if (input.explicitName !== null) {
    return resolveStoreByName({
      name: input.explicitName,
      ...(input.home !== undefined && { home: input.home }),
    });
  }

  const { config, error: registryError } = await tryLoadKbRegistry({
    ...(input.home !== undefined && { home: input.home }),
  });
  const { defaultKb } = config;
  if (defaultKb === undefined) {
    return { ok: false, reason: 'no-default', ...(registryError !== undefined && { registryError }) };
  }
  if (defaultKb.readonly === true) {
    return { ok: false, reason: 'readonly-store', name: defaultKb.name, path: defaultKb.path };
  }
  return { ok: true, store: { name: defaultKb.name, path: defaultKb.path } };
}
