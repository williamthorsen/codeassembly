/** Two or more skill-delivery rulebooks resolving to one skill name, which would share a directory and clobber. */
export interface SkillNameCollision {
  readonly skillName: string;
  readonly slugs: ReadonlyArray<string>;
}

/**
 * The rulebook fields a collision check reads. Declared structurally rather than as `ResolvedRulebook` so the rules
 * stay independent of the deploy path; a resolved rulebook satisfies it as-is.
 */
export interface SkillDeliveringRulebook {
  readonly skill: boolean;
  readonly skillName: string;
  readonly slug: string;
}

/**
 * Lists the directory names delivered as both a rulebook skill and a declared skill. The two delivery namespaces share
 * one project-local skills dir, so a name in both would let them clobber each other, and the conflict can only be
 * resolved by renaming one side.
 */
export function findCrossNamespaceCollisions(
  rulebookSkillDirs: ReadonlyArray<string>,
  declaredSkillSlugs: ReadonlySet<string>,
): ReadonlyArray<string> {
  return Array.from(new Set(rulebookSkillDirs).intersection(declaredSkillSlugs));
}

/**
 * Lists each skill name two or more skill-delivery rulebooks resolve to, with the slugs that reached it. All but one
 * need a distinct `skill-name` override; without one they would share a directory and the last write would win.
 */
export function findSkillNameCollisions(
  rulebooks: ReadonlyArray<SkillDeliveringRulebook>,
): ReadonlyArray<SkillNameCollision> {
  const slugsByName = new Map<string, Array<string>>();
  for (const rulebook of rulebooks) {
    if (!rulebook.skill) {
      continue;
    }
    const slugs = slugsByName.get(rulebook.skillName) ?? [];
    slugs.push(rulebook.slug);
    slugsByName.set(rulebook.skillName, slugs);
  }

  return Array.from(slugsByName)
    .filter(([, slugs]) => slugs.length > 1)
    .map(([skillName, slugs]) => ({ skillName, slugs }));
}
