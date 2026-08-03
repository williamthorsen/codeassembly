import { tryLoadKbRegistry } from '@williamthorsen/kb/discovery';

import { DEFAULT_KB_SENTINEL } from './default-kb-sentinel.ts';
import { resolveStoreByName, type ResolveStoreOutcome } from './resolve-store-by-name.ts';

/**
 * The capture resolution outcome: a resolved store, or a categorical failure. Extends `resolveStoreByName`'s outcome
 * with two capture-specific failures:
 *
 * - `missing-store`: `--store` was omitted entirely. The capture is refused rather than resolved for, since the helper
 *   cannot tell a deliberate default from a forgotten destination. It carries the registered store names and the
 *   resolved default name so the caller can build a self-documenting error that names the alternatives, plus the
 *   registry-load error when one occurred.
 * - `no-default`: `--store @default` was given but the registry declares no usable `default_kb`. It carries the
 *   registry-load error when one occurred, so an unresolvable `default_kb` surfaces its cause.
 */
export type ResolveCaptureTargetOutcome =
  | ResolveStoreOutcome
  | { ok: false; reason: 'missing-store'; registeredStores: string[]; defaultName?: string; registryError?: string }
  | { ok: false; reason: 'no-default'; registryError?: string };

/**
 * Resolves the store a capture writes into. A concrete `--store <name>` resolves by registry name (delegating to
 * `resolveStoreByName`); the reserved `@default` sentinel resolves the registry's `default_kb` (refusing a readonly
 * default like any readonly store, and reporting `no-default` when none is configured); an omitted `--store`
 * (`explicitName === null`) is refused with `missing-store`, never resolved to a silent default.
 *
 * `home` overrides the directory the user-global `kb.yaml` is read from; it defaults to the real `$HOME` and exists
 * so tests can isolate registry resolution from the developer's environment.
 */
export async function resolveCaptureTarget(input: {
  explicitName: string | null;
  home?: string;
}): Promise<ResolveCaptureTargetOutcome> {
  // A concrete store name resolves by registry name; only an omitted value or the sentinel need the registry here.
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
