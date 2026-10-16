import process from 'node:process';

import { findKbRoot, type KbRegistry, tryLoadKbRegistry } from '@williamthorsen/kb/discovery';

import { DEFAULT_KB_SENTINEL } from './kb-role-sentinels.ts';

/** A knowledge base resolved as the write target. */
export interface ResolvedKb {
  /** The KB's display name. `null` for a `.kb/`-discovered KB without a registry entry. */
  name: string | null;
  /** Absolute path to the KB's root directory. */
  path: string;
  /** Which selection rule applied. */
  source: 'explicit' | 'discovered' | 'registry-default';
}

/**
 * The selection outcome: a resolved writable KB, or a categorical failure that the caller turns into a structured
 * error.
 *
 * `missing-destination` and `no-default` include the registry-load error when one occurred, so that the caller can
 * report an unusable registry's cause rather than an absent entry.
 */
export type ResolveKbOutcome =
  | { ok: true; kb: ResolvedKb }
  | { ok: false; reason: 'no-kb-resolvable'; requestedKb: string }
  | { ok: false; reason: 'missing-destination'; registeredKbs: string[]; defaultName?: string; registryError?: string }
  | { ok: false; reason: 'no-default'; registryError?: string }
  | { ok: false; reason: 'readonly-kb'; kbName: string; kbPath: string };

/** A resolution failure: the single source of the error codes that the KB skills report. */
export type KbResolutionFailure = Extract<ResolveKbOutcome, { ok: false }>;

/** An error code that a KB skill reports when it cannot resolve a knowledge base. */
export type KbResolutionErrorCode = KbResolutionFailure['reason'];

/** A failure that discovery alone can produce, without `--kb` or the `@default` sentinel. */
export type KbDiscoveryFailure = Extract<KbResolutionFailure, { reason: 'missing-destination' | 'readonly-kb' }>;

/** An error code that a discovery-only KB skill reports when it cannot resolve a knowledge base. */
export type KbDiscoveryErrorCode = KbDiscoveryFailure['reason'];

/** The selection outcome of discovery alone. */
export type DiscoverKbOutcome = KbDiscoveryFailure | { ok: true; kb: ResolvedKb };

/**
 * Resolves the knowledge base that contains `startDir` by walking up for a `.kb/`, refusing a read-only KB to a caller
 * that intends to write. Takes the same `requireWritable` and `home` options as `resolveWritableKb`.
 */
export async function discoverWritableKb(input: {
  startDir: string;
  requireWritable?: boolean;
  home?: string;
}): Promise<DiscoverKbOutcome> {
  const registry = await loadRegistry(input);
  return discoverInRegistry({ ...registry, startDir: input.startDir, requireWritable: input.requireWritable ?? true });
}

/**
 * Resolves the single knowledge base on which a command operates, refusing a read-only KB to a caller that intends to
 * write.
 *
 * Precedence: The `--kb @default` sentinel, the only way to select the registry's `default_kb`, takes precedence over a
 * concrete `--kb <name>`, which takes precedence over `.kb/` discovery. Without a `--kb` or a discoverable `.kb/`,
 * resolution fails with `missing-destination`; the registry default is never a silent fall-through.
 *
 * `requireWritable` defaults to `true`, so a caller that omits it gets the write-safe answer; a report or a survey
 * passes `false` and reads a store that the registry marks `readonly: true`. A discovered KB without a registry entry
 * does not have a `readonly` flag to consult and counts as writable.
 *
 * `home` overrides the directory from which the user-global `kb.yaml` is read; it defaults to the real `$HOME`
 * and exists so that tests can isolate registry resolution from the developer's environment.
 */
export async function resolveWritableKb(input: {
  startDir: string;
  explicitKb: string | null;
  requireWritable?: boolean;
  home?: string;
}): Promise<ResolveKbOutcome> {
  const requireWritable = input.requireWritable ?? true;
  const { config, registryError } = await loadRegistry(input);

  // Check the sentinel before the by-name lookup, so that a KB literally named "@default" cannot shadow it.
  if (input.explicitKb === DEFAULT_KB_SENTINEL) {
    const { defaultKb } = config;
    if (defaultKb === undefined) {
      return { ok: false, reason: 'no-default', ...(registryError !== undefined && { registryError }) };
    }
    if (refusesAsReadonly(defaultKb.readonly, requireWritable)) {
      return { ok: false, reason: 'readonly-kb', kbName: defaultKb.name, kbPath: defaultKb.path };
    }
    return { ok: true, kb: { name: defaultKb.name, path: defaultKb.path, source: 'registry-default' } };
  }

  if (input.explicitKb !== null) {
    const match = config.entries.find((entry) => entry.name === input.explicitKb);
    if (match === undefined) {
      return { ok: false, reason: 'no-kb-resolvable', requestedKb: input.explicitKb };
    }
    if (refusesAsReadonly(match.readonly, requireWritable)) {
      return { ok: false, reason: 'readonly-kb', kbName: match.name, kbPath: match.path };
    }
    return { ok: true, kb: { name: match.name, path: match.path, source: 'explicit' } };
  }

  return discoverInRegistry({ config, registryError, startDir: input.startDir, requireWritable });
}

// region | Helpers

/** Runs `.kb/` discovery from `startDir` against an already-loaded registry. */
async function discoverInRegistry(input: {
  config: KbRegistry;
  registryError: string | undefined;
  startDir: string;
  requireWritable: boolean;
}): Promise<DiscoverKbOutcome> {
  const { config, registryError } = input;
  const discovered = await findKbRoot({ startDir: input.startDir });
  if (discovered !== null) {
    const registryMatch = config.entries.find((entry) => entry.path === discovered.path);
    if (registryMatch !== undefined && refusesAsReadonly(registryMatch.readonly, input.requireWritable)) {
      return { ok: false, reason: 'readonly-kb', kbName: registryMatch.name, kbPath: registryMatch.path };
    }
    return {
      ok: true,
      kb: {
        name: registryMatch?.name ?? null,
        path: discovered.path,
        source: 'discovered',
      },
    };
  }

  // Include the registered KB names and the default's name, so that the caller's error can point to `--kb @default`.
  return {
    ok: false,
    reason: 'missing-destination',
    registeredKbs: config.entries.map((entry) => entry.name),
    ...(config.defaultKb !== undefined && { defaultName: config.defaultKb.name }),
    ...(registryError !== undefined && { registryError }),
  };
}

/** Loads the KB registry, warning on stderr when it cannot be read. */
async function loadRegistry(input: {
  startDir: string;
  home?: string;
}): Promise<{ config: KbRegistry; registryError: string | undefined }> {
  // Warn to stderr so that a permission error or a YAML defect is distinguishable from "no config file at all".
  const { config, error: registryError } = await tryLoadKbRegistry({
    projectDir: input.startDir,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (registryError !== undefined) {
    process.stderr.write(`kb-shared: warning: could not load kb.yaml registry: ${registryError}\n`);
  }
  return { config, registryError };
}

/** Reports whether to refuse this caller because of a store's `readonly` flag. */
function refusesAsReadonly(isReadonly: boolean | undefined, requireWritable: boolean): boolean {
  return requireWritable && isReadonly === true;
}

// endregion | Helpers
