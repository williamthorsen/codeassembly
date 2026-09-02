import path from 'node:path';

import { artifactFrontmatterPath } from './artifact-types.ts';
import { describeSearchedLocations, type SourceResolver } from './content-sources.ts';
import { expandIncludes } from './directive-expander.ts';
import { parseRulebookFile } from './rulebook-schema.ts';
import { resolveSkillName } from './rulebook-skill.ts';
import { isEnoent } from './type-guards.ts';

/** A declared rulebook resolved against its owning source: its neutral body and which delivery modes it requests. */
export interface ResolvedRulebook {
  readonly slug: string;
  readonly skillName: string;
  readonly body: string;
  readonly ambient: boolean;
  /** Whether the rulebook declares that a guidance-hook binding is how it is reached. No delivery pass reads it. */
  readonly hook: boolean;
  readonly skill: boolean;
  readonly description: string | undefined;
  /** The name of the declared source it resolved from, or `undefined` for the built-in library. */
  readonly source: string | undefined;
  /** The version declared by the rulebook, named in its deployed output so an agent can read which version it holds. */
  readonly version: string | undefined;
}

/**
 * Reads a rulebook from its owning source (a declared source or the library, resolved through `resolver`), expands its
 * include directives against that source's own root, validates its frontmatter, and returns its neutral body and
 * delivery. A missing frontmatter file throws an error naming the resolving source.
 *
 * Expanding here rather than at render is what puts the hook checks, both delivery modes, and the guidance-hook fills
 * on one inlined body. A hook arriving through a partial would otherwise reach the fill pass unseen by the check that
 * rejects one on a bound rulebook.
 */
export async function resolveRulebook(slug: string, resolver: SourceResolver): Promise<ResolvedRulebook> {
  const resolved = await resolver.resolve('rulebook', slug);
  if (resolved === undefined) {
    const searched = describeSearchedLocations(resolver, 'rulebook', slug);
    throw new Error(`Declared rulebook "${slug}" was not found in any of: ${searched}`);
  }

  const srcPath = path.join(resolved.dir, artifactFrontmatterPath('rulebook', slug));
  let content: string;
  try {
    content = await expandIncludes(srcPath, resolved.dir);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      const origin = resolved.source === undefined ? 'the library' : `source "${resolved.source}"`;
      throw new Error(`Declared rulebook "${slug}" was not found in ${origin} at ${srcPath}`, { cause: error });
    }
    throw error;
  }

  const { rulebook, body } = parseRulebookFile(content, `${slug}.md`);
  return {
    slug,
    skillName: resolveSkillName(slug, rulebook['skill-name']),
    body: `${body.trim()}\n`,
    ambient: rulebook.delivery.includes('ambient'),
    hook: rulebook.delivery.includes('hook'),
    skill: rulebook.delivery.includes('skill'),
    description: rulebook.description,
    source: resolved.source,
    version: rulebook.version,
  };
}
