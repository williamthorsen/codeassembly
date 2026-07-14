import type { KbConfig } from '../config/config-schema.ts';
import { loadKbConfig } from '../config/load-config.ts';
import { resolveKbDir } from '../layout/index.ts';
import { pathsFindings } from '../lints/paths.ts';
import { tagAliasFindings } from '../lints/tag-alias.ts';
import { loadAliases } from '../tags/load-aliases.ts';
import type { Finding, KbRoot } from '../types.ts';
import { checkVaultIntegrity } from '../vault-integrity/check-vault-integrity.ts';
import { type EnumeratedNote, enumerateNotes } from './enumerate.ts';

/** The result of a check run: the effective config, every enumerated note, and every finding the checks produced. */
export interface CheckResult {
  /** The effective `KbConfig` the run used — loaded from `.kb/config.yaml`, or `defaultKbConfig` when absent. */
  config: KbConfig;
  /** Every note enumerated under the store's `config.targets`, in walk order. */
  notes: readonly EnumeratedNote[];
  /** Findings from whole-vault integrity (unresolved links, basename collisions) and the tag-alias and paths lints. */
  findings: readonly Finding[];
}

/**
 * Runs the store's config-driven check: load `.kb/config.yaml` and `.kb/tag-aliases.yaml`, enumerate notes under the
 * config's `targets`/`exclude`, and compose whole-vault integrity with the type-blind per-note lints across them.
 * Frontmatter validity is owned by the record types at write time, so no frontmatter re-validation runs here.
 *
 * Returns the effective config alongside the enumerated notes and findings, so a consumer (e.g. `kb-curate`) can layer
 * its own detectors over the same enumeration without walking the tree twice, and can read the resolved
 * `targets`/`exclude` without re-loading `.kb/config.yaml`.
 *
 * A structural defect in either loaded file throws a `KbLoaderError` (the loaders' own contract); the caller decides
 * how to surface it. Any other error from enumeration or the checks propagates unchanged — it is never relabeled as a
 * config defect.
 */
export async function check(input: { kbRoot: string }): Promise<CheckResult> {
  const kbRoot: KbRoot = { path: input.kbRoot, kbDir: resolveKbDir(input.kbRoot), via: 'ancestor-walk' };

  const [config, aliases] = await Promise.all([loadKbConfig({ kbRoot }), loadAliases({ kbRoot })]);

  const notes = await enumerateNotes({ kbRoot: input.kbRoot, config });

  const findings: Finding[] = [
    ...checkVaultIntegrity(notes),
    ...notes.flatMap((note) => [...tagAliasFindings(note, aliases), ...pathsFindings(note)]),
  ];

  return { config, notes, findings };
}
