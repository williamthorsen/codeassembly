import process from 'node:process';

import { findKbRoot, tryLoadKbRegistry } from '@williamthorsen/kb/discovery';

import { DEFAULT_KB_SENTINEL } from './default-kb-sentinel.ts';

/** A knowledge base resolved as the write target. */
export interface ResolvedKb {
  /** The KB's display name. `null` for a `.kb/`-discovered KB with no registry entry. */
  name: string | null;
  /** Absolute path to the KB's root directory. */
  path: string;
  /** Which selection rule fired. */
  source: 'explicit' | 'discovered' | 'registry-default';
}

/**
 * The selection outcome: a resolved writable KB, or a categorical failure the caller turns into a structured
 * error.
 *
 * - `no-kb-resolvable`: an explicit `--kb <name>` matched no registered entry. Carries the unmatched name.
 * - `missing-destination`: no `--kb` was given and no `.kb/` was discoverable, so no destination could be
 *   determined. The registry default is reachable only via `--kb @default`, never by silent fall-through. Carries
 *   the registered KB names and the resolved default name so the caller can build a self-documenting error that
 *   names the alternatives, plus the registry-load error when one occurred.
 * - `no-default`: `--kb @default` was given but the registry declares no usable `default_kb`. Carries the
 *   registry-load error when one occurred, so an unresolvable `default_kb` surfaces its cause.
 * - `readonly-kb`: the resolved KB is registered with `readonly: true` and the caller required a writable one. Always
 *   carries the resolved name and path so the caller can surface them in its structured error.
 */
export type ResolveKbOutcome =
  | { ok: true; kb: ResolvedKb }
  | { ok: false; reason: 'no-kb-resolvable'; requestedKb: string }
  | { ok: false; reason: 'missing-destination'; registeredKbs: string[]; defaultName?: string; registryError?: string }
  | { ok: false; reason: 'no-default'; registryError?: string }
  | { ok: false; reason: 'readonly-kb'; kbName: string; kbPath: string };

/**
 * Resolves the single knowledge base a command operates on, refusing a read-only KB to a caller that intends to write.
 *
 * Precedence: an explicit `--kb @default` sentinel (the only path to the registry's `default_kb`) beats a concrete
 * `--kb <name>`, which beats `.kb/` discovery. When no `--kb` is given and no `.kb/` is discoverable, resolution fails
 * with `missing-destination` rather than falling through to `default_kb`. After a KB is selected, the matching
 * `kb.yaml` entry's `readonly` flag is consulted: a `true` value fails with `'readonly-kb'` unless `requireWritable`
 * is `false`. A discovered KB with no registry entry has no metadata to consult and is assumed writable.
 *
 * `requireWritable` defaults to `true`, so a caller that says nothing gets the write-safe answer. A read-only
 * operation — a report, a survey — passes `false` and reaches a store the registry marks `readonly: true`, which it
 * has every right to read.
 *
 * `home` overrides the directory the user-global `kb.yaml` is read from; it defaults to the real `$HOME`
 * and exists so tests can isolate registry resolution from the developer's environment.
 */
export async function resolveWritableKb(input: {
  startDir: string;
  explicitKb: string | null;
  requireWritable?: boolean;
  home?: string;
}): Promise<ResolveKbOutcome> {
  const requireWritable = input.requireWritable ?? true;

  // Warn to stderr so a permission error or YAML defect is distinguishable from "no config file at all,"
  // which would otherwise make the resulting failure hard to diagnose.
  const { config, error: registryError } = await tryLoadKbRegistry({
    projectDir: input.startDir,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (registryError !== undefined) {
    process.stderr.write(`kb-shared: warning: could not load kb.yaml registry: ${registryError}\n`);
  }

  // The reserved sentinel is the only path to the registry default. It is checked before by-name lookup so it is
  // never mistaken for a KB literally named "@default", and it overrides discovery like a concrete `--kb <name>`.
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

  // No `--kb` and no discoverable `.kb/`: refuse rather than silently writing to `default_kb`. Carry the registered
  // KB names and the default's name so the caller can build a self-documenting error that points to `--kb @default`.
  return {
    ok: false,
    reason: 'missing-destination',
    registeredKbs: config.entries.map((entry) => entry.name),
    ...(config.defaultKb !== undefined && { defaultName: config.defaultKb.name }),
    ...(registryError !== undefined && { registryError }),
  };
}

// region | Helpers

/** Reports whether a store's `readonly` flag refuses this caller. */
function refusesAsReadonly(isReadonly: boolean | undefined, requireWritable: boolean): boolean {
  return requireWritable && isReadonly === true;
}

// endregion | Helpers
