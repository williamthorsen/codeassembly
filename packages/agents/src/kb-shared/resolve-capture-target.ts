import { tryLoadKbRegistry } from '@williamthorsen/kb/discovery';

import { DEFAULT_KB_SENTINEL } from './default-kb-sentinel.ts';
import { resolveStoreByName, type ResolveStoreOutcome } from './resolve-store-by-name.ts';

/**
 * The capture resolution outcome: a resolved store, or a categorical failure. Extends `resolveStoreByName`'s outcome
 * with two capture-specific failures:
 *
 * - `missing-store`: `--store` was omitted, and the helper cannot tell a deliberate default from a forgotten
 *   destination, so it refuses. The registered store names and the resolved default name let the caller name the
 *   alternatives in its error.
 * - `no-default`: `--store @default` was given but the registry declares no usable `default_kb`.
 *
 * Both carry the registry-load error when one occurred, so that an unusable registry surfaces its cause.
 */
export type ResolveCaptureTargetOutcome =
  | ResolveStoreOutcome
  | { ok: false; reason: 'missing-store'; registeredStores: string[]; defaultName?: string; registryError?: string }
  | { ok: false; reason: 'no-default'; registryError?: string };

/**
 * Resolves the store a capture writes into, from `--store` alone: a registry name, or the reserved `@default` sentinel
 * for the registry's `default_kb`. An omitted `--store` is refused with `missing-store`, never resolved to a silent
 * default. A readonly default is refused like any other readonly store.
 *
 * `home` overrides the directory from which the user-global `kb.yaml` is read; it defaults to the real `$HOME`
 * and exists so that tests can isolate registry resolution from the developer's environment.
 */
export async function resolveCaptureTarget(input: {
  explicitName: string | null;
  home?: string;
}): Promise<ResolveCaptureTargetOutcome> {
  if (input.explicitName !== null && input.explicitName !== DEFAULT_KB_SENTINEL) {
    return resolveStoreByName({
      name: input.explicitName,
      ...(input.home !== undefined && { home: input.home }),
    });
  }

  const { config, error: registryError } = await tryLoadKbRegistry({
    ...(input.home !== undefined && { home: input.home }),
  });

  if (input.explicitName === null) {
    return {
      ok: false,
      reason: 'missing-store',
      registeredStores: config.entries.map((entry) => entry.name),
      ...(config.defaultKb !== undefined && { defaultName: config.defaultKb.name }),
      ...(registryError !== undefined && { registryError }),
    };
  }

  const { defaultKb } = config;
  if (defaultKb === undefined) {
    return { ok: false, reason: 'no-default', ...(registryError !== undefined && { registryError }) };
  }
  if (defaultKb.readonly === true) {
    return { ok: false, reason: 'readonly-store', name: defaultKb.name, path: defaultKb.path };
  }
  return { ok: true, store: { name: defaultKb.name, path: defaultKb.path } };
}
