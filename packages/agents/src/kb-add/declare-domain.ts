import { join, relative, sep } from 'node:path';

import { pathExists } from '@williamthorsen/kb/filesystem';
import { resolveKbDir, TAXONOMY_FILE } from '@williamthorsen/kb/layout';
import {
  loadTaxonomy,
  resolveDomain,
  resolveParent,
  type Taxonomy,
  type TaxonomyDeclaration,
  writeTaxonomy,
} from '@williamthorsen/kb/taxonomy';

/**
 * Records a written note's folder in `.kb/taxonomy.yaml`, declaring it and every undeclared ancestor when no domain
 * declares it. Returns where the note sits and what the declaration added, or `undefined` for a store that has not
 * adopted a taxonomy, which this leaves untouched.
 *
 * Adoption is the file's presence, not what it declares. A store with no `.kb/taxonomy.yaml` behaves as it did before
 * the taxonomy existed, while a store whose taxonomy is empty grows its first domain from its first capture. (The
 * drift rules read an empty taxonomy as "not adopted" instead, correctly: reporting on a structure is a different
 * question from recording one.)
 *
 * The declaration fires on the note's exact folder, aligning with `taxonomy.undeclared` — a folder nested under a
 * declared domain is itself undeclared. It then covers every undeclared ancestor, because `taxonomy.orphan` warns on a
 * declared domain whose parent is not, and a leaf-only append would have routine nested captures minting lint warnings
 * on the next `kb check`. Ancestors are declared bare and provisional whatever the mode: nothing names what a grouping
 * folder is for, and the supplied description belongs to the leaf. A folder some domain already declares is left
 * alone, ancestors included: that is pre-existing drift the lints own.
 *
 * The note's domain comes from its written path through the same mapping the drift rules use, so this cannot disagree
 * with what a later `kb check` observes.
 *
 * A declaration failure never fails the capture. The note is already on disk, and propagating the failure would exit
 * non-zero and read as a capture that never happened; instead the result carries a warning naming what went
 * undeclared, and `taxonomy.undeclared` surfaces the folder on the next `kb check`.
 */
export async function declareDomain(input: {
  kbPath: string;
  /** Absolute path of the note that was written. */
  notePath: string;
  /** The leaf domain's description, or `null` when none was supplied. */
  description: string | null;
  /** Whether the capture ran unconfirmed, which routes the leaf to `provisional:` however it was described. */
  auto: boolean;
}): Promise<DomainPlacement | undefined> {
  const relativePath = relative(input.kbPath, input.notePath).split(sep).join('/');
  const domain = resolveDomain(relativePath) ?? null;

  try {
    if (!(await pathExists(join(input.kbPath, TAXONOMY_FILE)))) {
      return undefined;
    }
    // A note at the assertions root sits in no folder, so there is no domain to declare and no lint that can see it.
    if (domain === null) {
      return { domain, added: [] };
    }

    const kbRoot = { path: input.kbPath, kbDir: resolveKbDir(input.kbPath) };
    const taxonomy = await loadTaxonomy({ kbRoot });
    if (taxonomy.has(domain)) {
      return { domain, added: [] };
    }

    const declarations = buildDeclarations({
      domain,
      taxonomy,
      description: input.description,
      auto: input.auto,
    });
    const { added } = await writeTaxonomy({ kbRoot, declarations });
    return { domain, added };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const subject = domain === null ? 'the note placement' : `domain "${domain}"`;
    return { domain, added: [], warning: `could not declare ${subject} in ${TAXONOMY_FILE}: ${message}` };
  }
}

/** Where a written note sits in the store's taxonomy, and what recording it there added. */
export interface DomainPlacement {
  /** The domain the note sits in, or `null` when it sits at the assertions root and so under none. */
  domain: string | null;
  /** Domain paths this write added to the taxonomy, in the order the writer appended them. */
  added: string[];
  /** What went undeclared, when the taxonomy could not be read or appended to. */
  warning?: string;
}

// region | Helpers

/**
 * Builds the batch declaring `domain` and every undeclared ancestor. The leaf lands in `domains:` only when a
 * confirmed capture supplied a description; every other append is provisional, so it can be reviewed later.
 */
function buildDeclarations(input: {
  domain: string;
  taxonomy: Taxonomy;
  description: string | null;
  auto: boolean;
}): TaxonomyDeclaration[] {
  const { domain, taxonomy, description, auto } = input;

  const declarations: TaxonomyDeclaration[] = [
    {
      path: domain,
      ...(description !== null && { description }),
      provisional: auto || description === null,
    },
  ];

  let ancestor = resolveParent(domain);
  while (ancestor !== undefined) {
    if (!taxonomy.has(ancestor)) {
      declarations.push({ path: ancestor, provisional: true });
    }
    ancestor = resolveParent(ancestor);
  }

  return declarations;
}

// endregion | Helpers
