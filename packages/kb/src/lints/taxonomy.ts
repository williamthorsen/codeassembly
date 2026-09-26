import type { KbConfig } from '../config/config-schema.ts';
import { createNoteScopeMatcher } from '../config/note-scope.ts';
import { ASSERTIONS_DIR } from '../layout/index.ts';
import { resolveDomain, resolveParent } from '../taxonomy/domain-paths.ts';
import type { Taxonomy } from '../taxonomy/taxonomy-schema.ts';
import type { Finding } from '../types.ts';

/** The note fields that the taxonomy rules read. */
export interface TaxonomyNote {
  /** The note's path relative to the KB root, slash-separated. */
  relativePath: string;
}

/**
 * Reports each disagreement between a store's assertion folders and its declared taxonomy: `taxonomy.undeclared` for a
 * folder holding notes outside every declared domain, `taxonomy.unused` for a declared domain holding no note at or
 * beneath it, and `taxonomy.orphan` for a declared domain whose parent is undeclared. All are warnings, so drift is
 * reported without failing the run. All are vault-scoped: A run narrowed to selected notes still reports them.
 *
 * A taxonomy declaring nothing disables all three, whether because the file is absent or because it declares no
 * domains. The rules therefore report nothing for a store that has not adopted a taxonomy, rather than flagging
 * every folder that the store owns.
 *
 * Because the observed structure comes from the enumerated notes' own paths rather than a directory listing, the rules
 * add no filesystem traversal and consider exactly the notes that the run's `targets` and `exclude` admitted.
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
        buildFinding(taxonomyPath, 'undeclared', `folder "${domain}" contains notes but no domain declares it`),
      );
    }
  }

  for (const domain of declared) {
    // An excluded subtree is pruned during the walk, so the walk never enumerates its notes, and every domain inside
    // it would otherwise be reported as unused forever. The exemption is needed here only: With no notes to
    // observe, an excluded subtree cannot produce an undeclared folder in the first place.
    if (holdsNote(domain, observed) || matcher.isExcluded(`${ASSERTIONS_DIR}/${domain}`)) {
      continue;
    }
    findings.push(buildFinding(taxonomyPath, 'unused', `domain "${domain}" is declared but contains no notes`));
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

/** Reports whether any observed domain is `domain` itself or is beneath it. */
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

// endregion | Helpers
