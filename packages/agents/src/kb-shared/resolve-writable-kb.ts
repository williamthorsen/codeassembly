import process from 'node:process';

import type { KbConfig } from '@codeassembly/kb-core';
import { findKbRoot, loadKbConfig } from '@codeassembly/kb-core/discovery';

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
 * - `no-kb-resolvable`: no `.kb/` discovered, no registry default, and either no `--kb` or a `--kb` that did not
 *   match any registered entry.
 * - `readonly-kb`: the resolved KB is registered with `readonly: true`. Always carries the resolved name and path
 *   so the caller can surface them in its structured error.
 */
export type ResolveKbOutcome =
  | { ok: true; kb: ResolvedKb }
  | { ok: false; reason: 'no-kb-resolvable'; requestedKb: string | null }
  | { ok: false; reason: 'readonly-kb'; kbName: string; kbPath: string };

/**
 * Resolves the single knowledge base to write into and refuses read-only KBs.
 *
 * Precedence: `--kb <name>` (explicit) beats `.kb/` (discovered), which beats the registry's default-marked entry.
 * After a KB is selected, the matching `kb.yaml` entry's `readonly` flag is consulted: a `true` value refuses the
 * write with `'readonly-kb'`. A discovered KB with no registry entry has no metadata to consult and is assumed
 * writable.
 *
 * `home` overrides the directory the user-global `kb.yaml` is read from; it defaults to the real `$HOME`
 * and exists so tests can isolate registry resolution from the developer's environment.
 */
export async function resolveWritableKb(input: {
  startDir: string;
  explicitKb: string | null;
  home?: string;
}): Promise<ResolveKbOutcome> {
  const config = await loadKbConfigSafely({
    projectDir: input.startDir,
    ...(input.home !== undefined && { home: input.home }),
  });

  if (input.explicitKb !== null) {
    const match = config.entries.find((entry) => entry.name === input.explicitKb);
    if (match === undefined) {
      return { ok: false, reason: 'no-kb-resolvable', requestedKb: input.explicitKb };
    }
    if (match.readonly === true) {
      return { ok: false, reason: 'readonly-kb', kbName: match.name, kbPath: match.path };
    }
    return { ok: true, kb: { name: match.name, path: match.path, source: 'explicit' } };
  }

  const discovered = await findKbRoot({ startDir: input.startDir });
  if (discovered !== null) {
    const registryMatch = config.entries.find((entry) => entry.path === discovered.path);
    if (registryMatch?.readonly === true) {
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

  const defaultEntry = config.entries.find((entry) => entry.default === true);
  if (defaultEntry !== undefined) {
    if (defaultEntry.readonly === true) {
      return { ok: false, reason: 'readonly-kb', kbName: defaultEntry.name, kbPath: defaultEntry.path };
    }
    return {
      ok: true,
      kb: { name: defaultEntry.name, path: defaultEntry.path, source: 'registry-default' },
    };
  }

  return { ok: false, reason: 'no-kb-resolvable', requestedKb: null };
}

// region | Helpers

/**
 * Loads the merged `kb.yaml` registry, degrading a malformed or unreadable registry to an empty config and emitting
 * a warning to stderr so the operator can see why the registry did not contribute entries.
 *
 * A defective project- or user-level `kb.yaml` would otherwise throw out of `resolveWritableKb` and break the
 * structured result contract that every other failure path honors. Without the warning, a permission error or YAML
 * defect looked identical to "no config file at all," which made the resulting `no-kb-resolvable` failure hard
 * to diagnose.
 */
async function loadKbConfigSafely(input: { projectDir: string; home?: string }): Promise<KbConfig> {
  try {
    return await loadKbConfig({
      projectDir: input.projectDir,
      ...(input.home !== undefined && { home: input.home }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kb-shared: warning: could not load kb.yaml registry: ${message}\n`);
    return { entries: [], sources: {} };
  }
}

// endregion | Helpers
