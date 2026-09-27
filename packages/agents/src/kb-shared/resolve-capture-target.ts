import { tryLoadKbRegistry } from '@williamthorsen/kb/discovery';

import { DEFAULT_KB_SENTINEL, FEEDBACK_KB_SENTINEL } from './kb-role-sentinels.ts';
import { resolveStoreByName, type ResolveStoreOutcome } from './resolve-store-by-name.ts';

/**
 * The capture resolution outcome: a resolved store, or a categorical failure. Extends `resolveStoreByName`'s outcome
 * with three capture-specific failures:
 *
 * - `missing-store`: `--store` was omitted, and the helper cannot tell a deliberate default from a forgotten
 *   destination, so it refuses. The registered store names and the resolved role names let the caller name the
 *   alternatives in its error.
 * - `no-default`: `--store @default` was given but the registry declares no usable `default_kb`.
 * - `no-feedback`: `--store @feedback` was given but the registry declares no usable `feedback_kb`.
 *
 * Each includes the registry-load error when one occurred, so that the caller can report an unusable registry's cause.
 */
export type ResolveCaptureTargetOutcome =
  | ResolveStoreOutcome
  | {
      ok: false;
      reason: 'missing-store';
      registeredStores: string[];
      defaultName?: string;
      feedbackName?: string;
      registryError?: string;
    }
  | { ok: false; reason: 'no-default'; registryError?: string }
  | { ok: false; reason: 'no-feedback'; registryError?: string };

/**
 * Resolves the store into which a capture writes, from `--store` alone: a registry name, `@default` for the registry's
 * `default_kb`, or `@feedback` for its `feedback_kb`. An omitted `--store` is refused with `missing-store`, never
 * resolved to a silent default. A readonly role store is refused like any other readonly store.
 *
 * `home` overrides the directory from which the user-global `kb.yaml` is read; it defaults to the real `$HOME`
 * and exists so that tests can isolate registry resolution from the developer's environment.
 */
export async function resolveCaptureTarget(input: {
  explicitName: string | null;
  home?: string;
}): Promise<ResolveCaptureTargetOutcome> {
  const { explicitName } = input;
  if (explicitName !== null && explicitName !== DEFAULT_KB_SENTINEL && explicitName !== FEEDBACK_KB_SENTINEL) {
    return resolveStoreByName({
      name: explicitName,
      ...(input.home !== undefined && { home: input.home }),
    });
  }

  const { config, error: registryError } = await tryLoadKbRegistry({
    ...(input.home !== undefined && { home: input.home }),
  });

  if (explicitName === null) {
    return {
      ok: false,
      reason: 'missing-store',
      registeredStores: config.entries.map((entry) => entry.name),
      ...(config.defaultKb !== undefined && { defaultName: config.defaultKb.name }),
      ...(config.feedbackKb !== undefined && { feedbackName: config.feedbackKb.name }),
      ...(registryError !== undefined && { registryError }),
    };
  }

  const isFeedback = explicitName === FEEDBACK_KB_SENTINEL;
  const roleKb = isFeedback ? config.feedbackKb : config.defaultKb;
  if (roleKb === undefined) {
    return {
      ok: false,
      reason: isFeedback ? 'no-feedback' : 'no-default',
      ...(registryError !== undefined && { registryError }),
    };
  }
  if (roleKb.readonly === true) {
    return { ok: false, reason: 'readonly-store', name: roleKb.name, path: roleKb.path };
  }
  return { ok: true, store: { name: roleKb.name, path: roleKb.path } };
}
