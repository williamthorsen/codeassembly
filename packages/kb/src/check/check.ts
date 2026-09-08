import { join } from 'node:path';

import type { KbConfig, StoreVisibility } from '../config/config-schema.ts';
import { loadKbConfig } from '../config/load-config.ts';
import { tryLoadKbRegistry } from '../discovery/load-registry.ts';
import { resolveKbDir, TAXONOMY_FILE } from '../layout/index.ts';
import { pathsFindings } from '../lints/paths.ts';
import { tagAliasFindings } from '../lints/tag-alias.ts';
import { taxonomyFindings } from '../lints/taxonomy.ts';
import { loadAliases } from '../tags/load-aliases.ts';
import { loadTaxonomy } from '../taxonomy/load-taxonomy.ts';
import type { Finding, KbRoot } from '../types.ts';
import { checkVaultIntegrity, type ForeignStore } from '../vault-integrity/check-vault-integrity.ts';
import { type EnumeratedNote, enumerateNotes } from './enumerate.ts';
import { collectStorePrefixes, resolveForeignStores } from './resolve-foreign-stores.ts';

/** The result of a check run: the effective config, every enumerated note, and every finding the checks produced. */
export interface CheckResult {
  /** The effective `KbConfig` the run used — loaded from `.kb/config.yaml`, or `defaultKbConfig` when absent. */
  config: KbConfig;
  /** Every note that the store's `config.targets` and, inside a git working tree, its git scope admit, in walk order. */
  notes: readonly EnumeratedNote[];
  /**
   * Findings from whole-vault integrity (unresolved links, basename collisions), taxonomy drift, and the tag-alias and
   * paths lints.
   */
  findings: readonly Finding[];
}

/**
 * Runs the store's config-driven check: load `.kb/config.yaml`, `.kb/tag-aliases.yaml`, and `.kb/taxonomy.yaml`,
 * enumerate notes under the config's `targets`/`exclude`, and compose whole-vault integrity and taxonomy drift with
 * the type-blind per-note lints across them. Frontmatter validity is owned by the record types at write time, so no
 * frontmatter re-validation runs here.
 *
 * Inside a git working tree the enumeration narrows to what git accounts for, so a note the repository ignores is
 * neither checked nor available as a wikilink target; see {@link enumerateNotes} for the rule.
 *
 * A `[[store:Target]]` link resolves against the store its prefix names rather than this one. Those stores are looked
 * up in the merged `kb.yaml` registry, which is read from `~/.agents/kb.yaml` and from `cwd`'s project-local registry;
 * `cwd` defaults to the store root, so a caller that supplies none still resolves against the user-global registry.
 * Only the stores this store's own links name are consulted.
 *
 * Returns the effective config alongside the enumerated notes and findings, so a consumer (e.g. `kb-curate`) can layer
 * its own detectors over the same enumeration without walking the tree twice, and can read the resolved
 * `targets`/`exclude` without re-loading `.kb/config.yaml`.
 *
 * A structural defect in any loaded file throws a `KbLoaderError` (the loaders' own contract); the caller decides how
 * to surface it. Any other error from enumeration or the checks propagates unchanged — it is never relabeled as a
 * config defect.
 */
export async function check(input: { kbRoot: string; cwd?: string; home?: string }): Promise<CheckResult> {
  const kbRoot: KbRoot = { path: input.kbRoot, kbDir: resolveKbDir(input.kbRoot) };

  const [config, aliases, taxonomy] = await Promise.all([
    loadKbConfig({ kbRoot }),
    loadAliases({ kbRoot }),
    loadTaxonomy({ kbRoot }),
  ]);

  const notes = await enumerateNotes({ kbRoot: input.kbRoot, config });

  const qualified = await resolveQualifiedStores({
    notes,
    projectDir: input.cwd ?? input.kbRoot,
    sourceVisibility: config.visibility,
    ...(input.home !== undefined && { home: input.home }),
  });

  const findings: Finding[] = [
    ...registryFindings(qualified.registryError),
    ...checkVaultIntegrity(notes, { foreignStores: qualified.foreignStores, sourceVisibility: config.visibility }),
    ...taxonomyFindings({ notes, taxonomy, config, taxonomyPath: join(input.kbRoot, TAXONOMY_FILE) }),
    ...notes.flatMap((note) => [...tagAliasFindings(note, aliases), ...pathsFindings(note)]),
  ];

  return { config, notes, findings };
}

// region | Helpers

/** Reports a registry that would not load, which leaves every store-qualified link in the run unresolvable. */
function registryFindings(error: string | undefined): Finding[] {
  if (error === undefined) return [];
  return [
    {
      path: KB_REGISTRY_LABEL,
      scope: 'vault',
      rule: 'wikilinks.registry-unloadable',
      severity: 'error',
      message: `no store-qualified link can resolve: ${error}`,
    },
  ];
}

/**
 * Looks up the stores a run's links qualify. A run whose links name none reads no registry at all, so a store that
 * makes no cross-store link neither pays for the lookup nor answers for a defect in a registry elsewhere on the
 * machine.
 */
async function resolveQualifiedStores(input: {
  notes: readonly EnumeratedNote[];
  projectDir: string;
  sourceVisibility: StoreVisibility;
  home?: string;
}): Promise<{ foreignStores: ReadonlyMap<string, ForeignStore>; registryError?: string }> {
  const prefixes = collectStorePrefixes(input.notes);
  if (prefixes.size === 0) return { foreignStores: new Map() };

  const registry = await tryLoadKbRegistry({
    projectDir: input.projectDir,
    ...(input.home !== undefined && { home: input.home }),
  });
  const foreignStores = await resolveForeignStores({
    prefixes,
    registry: registry.config,
    sourceVisibility: input.sourceVisibility,
  });
  return { foreignStores, ...(registry.error !== undefined && { registryError: registry.error }) };
}

/** Names the registry in a finding's `path`, which no single file on disk stands for once the two tiers are merged. */
const KB_REGISTRY_LABEL = 'kb.yaml';

// endregion | Helpers
