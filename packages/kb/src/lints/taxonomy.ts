import type { KbConfig } from '../config/config-schema.ts';
import { createNoteScopeMatcher } from '../config/note-scope.ts';
import { ASSERTIONS_DIR } from '../layout/index.ts';
import type { Taxonomy } from '../taxonomy/taxonomy-schema.ts';
import type { Finding } from '../types.ts';

/** The note fields the taxonomy rules read. */
export interface TaxonomyNote {
  /** The note's path relative to the KB root, slash-separated. */
  relativePath: string;
}

/**
 * Reports where a store's assertion folders and its declared taxonomy disagree: `taxonomy.undeclared` for a folder
 * holding notes that no domain declares, `taxonomy.unused` for a declared domain holding no note at or beneath it, and
 * `taxonomy.orphan` for a declared domain whose parent is undeclared. All are warnings, so drift is reported without
 * failing the run, and all are vault-scoped, so a run narrowed to selected notes still sees them.
 *
 * A taxonomy declaring nothing disables all three, whether because the file is absent or because it declares no
 * domains. A store that has not adopted a taxonomy is therefore silent rather than reporting every folder it owns.
 *
 * The observed structure comes from the enumerated notes' own paths rather than a directory listing, so the rules add
 * no filesystem traversal and see exactly the notes the run's `targets` and `exclude` admitted.
 */
export function taxonomyFindings(input: {
  notes: readonly TaxonomyNote[];
  taxonomy: Taxonomy;
  config: KbConfig;
  /** Absolute path of `.kb/taxonomy.yaml`, which every finding is reported against. */
  taxonomyPath: string;
}): Finding[] {
  const { notes, taxonomy, config, taxonomyPath } = input;

  const declared = taxonomy.keys().toArray().toSorted();
  if (declared.length === 0) {
    return [];
  }

  const observed = new Set<string>();
  for (const note of notes) {
    const domain = resolveDomain(note.relativePath);
    if (domain !== undefined) {
      observed.add(domain);
    }
  }

  const matcher = createNoteScopeMatcher(config);
  const findings: Finding[] = [];

  for (const domain of [...observed].toSorted()) {
    if (!taxonomy.has(domain)) {
      findings.push(
        buildFinding(taxonomyPath, 'undeclared', `folder "${domain}" holds notes but no domain declares it`),
      );
    }
  }

  for (const domain of declared) {
    // An excluded subtree is pruned during the walk, so its notes never enumerate and every domain inside it would
    // otherwise report unused forever. The exemption is needed here only: with no notes to observe, an excluded
    // subtree cannot produce an undeclared folder in the first place.
    if (holdsNote(domain, observed) || matcher.isExcluded(`${ASSERTIONS_DIR}/${domain}`)) {
      continue;
    }
    findings.push(buildFinding(taxonomyPath, 'unused', `domain "${domain}" is declared but holds no notes`));
  }

  for (const domain of declared) {
    const parent = resolveParent(domain);
    if (parent !== undefined && !taxonomy.has(parent)) {
      findings.push(
        buildFinding(taxonomyPath, 'orphan', `domain "${domain}" is declared but its parent "${parent}" is not`),
      );
    }
  }

  return findings;
}

// region | Helpers

/** Builds one vault-scoped warning against the taxonomy file, where every one of these findings is remedied. */
function buildFinding(taxonomyPath: string, rule: string, message: string): Finding {
  return { path: taxonomyPath, scope: 'vault', rule: `taxonomy.${rule}`, severity: 'warning', message };
}

/** Reports whether any observed domain is `domain` itself or sits beneath it. */
function holdsNote(domain: string, observed: ReadonlySet<string>): boolean {
  if (observed.has(domain)) {
    return true;
  }
  const prefix = `${domain}/`;
  for (const candidate of observed) {
    if (candidate.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * Derives the domain a note sits in, or `undefined` when the note is not an assertion or sits at the assertions root.
 * Scoping to the assertions root is what keeps event records from registering as undeclared domains.
 */
function resolveDomain(relativePath: string): string | undefined {
  const prefix = `${ASSERTIONS_DIR}/`;
  if (!relativePath.startsWith(prefix)) {
    return undefined;
  }
  return resolveParent(relativePath.slice(prefix.length));
}

/** Derives a slash-path's parent, or `undefined` when it has no separator and so sits at the top level. */
function resolveParent(path: string): string | undefined {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash === -1 ? undefined : path.slice(0, lastSlash);
}

// endregion | Helpers
