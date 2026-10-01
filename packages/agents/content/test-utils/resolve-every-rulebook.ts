import { listCatalog, readArtifact } from 'codeassembly/api';

import { splitFrontmatter } from './split-frontmatter.ts';

/** One library rulebook: its slug, its include-expanded body without frontmatter, and its declared version. */
export interface ResolvedRulebook {
  readonly slug: string;
  readonly body: string;
  readonly version: string | undefined;
}

/** Reads every rulebook at a content root by slug, each with its includes expanded and its frontmatter parsed off. */
export async function resolveEveryRulebook(contentRoot: string): Promise<ReadonlyMap<string, ResolvedRulebook>> {
  const slugs = (await listCatalog(contentRoot)).rulebook;
  if (slugs.length === 0) {
    // A suite that reports what it finds would stay green over an empty catalog.
    throw new Error(`The catalog at ${contentRoot} doesn't name any rulebook`);
  }

  const rulebooks = await Promise.all(
    slugs.map(async (slug): Promise<ResolvedRulebook> => {
      const { body, frontmatter } = await readArtifact(contentRoot, 'rulebook', slug);
      const { version } = frontmatter;
      return {
        slug,
        body: `${splitFrontmatter(body).body.trim()}\n`,
        version: typeof version === 'string' ? version : undefined,
      };
    }),
  );
  return new Map(rulebooks.map((rulebook) => [rulebook.slug, rulebook]));
}
