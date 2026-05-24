import process from 'node:process';

import type { KbConfig, KbConfigEntry } from '@codeassembly/kb-core';
import { findKbRoot, loadKbConfig } from '@codeassembly/kb-core/discovery';

import type { ResolvedKb } from './types.ts';

/** The selection outcome: a resolved KB, or a categorical failure the caller turns into a structured error. */
export type ResolveKbOutcome =
  | { ok: true; kb: ResolvedKb }
  | { ok: false; reason: 'no-kb-resolvable'; requestedKb: string | null };

/**
 * Resolves the single knowledge base to write into.
 *
 * Precedence: `--kb <name>` (explicit) beats `.kb/` (discovered), which beats the registry's default-marked entry.
 * Returns a categorical failure when nothing resolves, or when an explicit `--kb` does not match any registered entry.
 *
 * `home` overrides the directory the user-global `kb.yaml` is read from; it defaults to the real `$HOME`
 * and exists so tests can isolate registry resolution from the developer's environment.
 */
export async function resolveKb(input: {
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
    return { ok: true, kb: { name: match.name, path: match.path, source: 'explicit' } };
  }

  const discovered = await findKbRoot({ startDir: input.startDir });
  if (discovered !== null) {
    const registryMatch = matchByPath(config.entries, discovered.path);
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
 * A defective project- or user-level `kb.yaml` would otherwise throw out of `resolveKb` and break the structured
 * `AddResult` contract that every other failure path honors. Without the warning, a permission error or YAML
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
    process.stderr.write(`kb-add: warning: could not load kb.yaml registry: ${message}\n`);
    return { entries: [], sources: {} };
  }
}

/** Returns the registry entry whose absolute path matches `path`, or `undefined` when there is no match. */
function matchByPath(entries: readonly KbConfigEntry[], path: string): KbConfigEntry | undefined {
  return entries.find((entry) => entry.path === path);
}

// endregion | Helpers
