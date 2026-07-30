import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { artifactFrontmatterPath } from './artifact-types.ts';
import { describeSearchedLocations, type SourceResolver } from './content-sources.ts';
import { parseRulebookFile } from './rulebook-schema.ts';
import { resolveSkillName } from './rulebook-skill.ts';
import { isEnoent } from './type-guards.ts';

/** A declared rulebook resolved against its owning source: its neutral body and which delivery modes it requests. */
export interface ResolvedRulebook {
  readonly slug: string;
  readonly skillName: string;
  readonly body: string;
  readonly ambient: boolean;
  readonly skill: boolean;
  readonly description: string | undefined;
  /** The name of the declared source it resolved from, or `undefined` for the built-in library. */
  readonly source: string | undefined;
}

/**
 * Reads a rulebook from its owning source (a declared source or the library, resolved through `resolver`), validates
 * its frontmatter, and returns its neutral body and delivery. A missing frontmatter file throws an error naming the
 * resolving source.
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
    content = await readFile(srcPath, 'utf8');
  } catch (error: unknown) {
    if (isEnoent(error)) {
      const origin = resolved.source === undefined ? 'the library' : `source "${resolved.source}"`;
      throw new Error(`Declared rulebook "${slug}" was not found in ${origin} at ${srcPath}`);
    }
    throw error;
  }

  const { rulebook, body } = parseRulebookFile(content, `${slug}.md`);
  return {
    slug,
    skillName: resolveSkillName(slug, rulebook['skill-name']),
    body: `${body.trim()}\n`,
    ambient: rulebook.delivery.includes('ambient'),
    skill: rulebook.delivery.includes('skill'),
    description: rulebook.description,
    source: resolved.source,
  };
}
