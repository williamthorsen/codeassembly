import process from 'node:process';

import { findKbRoot, tryLoadKbRegistry } from '@williamthorsen/kb/discovery';

import { DEFAULT_KB_SENTINEL } from './default-kb-sentinel.ts';

/** A knowledge base resolved as the write target. */
export interface ResolvedKb {
  /** The KB's display name. `null` for a `.kb/`-discovered KB with no registry entry. */
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

/**
 * Resolves the single knowledge base on which a command operates, refusing a read-only KB to a caller that intends to
 * write.
 *
 * Precedence: The `--kb @default` sentinel, the only way to select the registry's `default_kb`, takes precedence over a
 * concrete `--kb <name>`, which takes precedence over `.kb/` discovery. With no `--kb` and no discoverable `.kb/`,
 * resolution fails with `missing-destination`; the registry default is never a silent fall-through.
 *
 * `requireWritable` defaults to `true`, so a caller that omits it gets the write-safe answer; a report or a survey
 * passes `false` and reads a store that the registry marks `readonly: true`. A discovered KB with no registry entry
 * has no `readonly` flag to consult and counts as writable.
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

  // Warn to stderr so that a permission error or a YAML defect is distinguishable from "no config file at all".
  const { config, error: registryError } = await tryLoadKbRegistry({
    projectDir: input.startDir,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (registryError !== undefined) {
    process.stderr.write(`kb-shared: warning: could not load kb.yaml registry: ${registryError}\n`);
  }

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

  const discovered = await findKbRoot({ startDir: input.startDir });
  if (discovered !== null) {
    const registryMatch = config.entries.find((entry) => entry.path === discovered.path);
    if (registryMatch !== undefined && refusesAsReadonly(registryMatch.readonly, requireWritable)) {
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

// region | Helpers

/** Reports whether to refuse this caller because of a store's `readonly` flag. */
function refusesAsReadonly(isReadonly: boolean | undefined, requireWritable: boolean): boolean {
  return requireWritable && isReadonly === true;
}

// endregion | Helpers
