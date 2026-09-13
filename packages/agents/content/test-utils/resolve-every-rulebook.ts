import { libraryResolver } from '../../src/lib/content-sources.ts';
import { enumerateCatalogSlugs } from '../../src/lib/library-catalog.ts';
import { indexRulebooksBySlug, type ResolvedRulebook, resolveRulebook } from '../../src/lib/rulebook-deploy.ts';

/** Resolves every rulebook of the library at a content root by slug, each with its includes expanded and its frontmatter parsed off. */
export async function resolveEveryRulebook(contentRoot: string): Promise<ReadonlyMap<string, ResolvedRulebook>> {
  const resolver = libraryResolver(contentRoot);
  const slugs = (await enumerateCatalogSlugs(contentRoot)).rulebook;
  if (slugs === undefined || slugs.length === 0) {
    // A suite that reports what it finds would stay green over an empty catalog.
    throw new Error(`The catalog at ${contentRoot} names no rulebook`);
  }

  return indexRulebooksBySlug(await Promise.all(slugs.map((slug) => resolveRulebook(slug, resolver))));
}
