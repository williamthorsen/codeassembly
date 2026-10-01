import { indexRulebooksBySlug, type ResolvedRulebook } from '../../lib/rulebook-deploy.ts';

/**
 * Collects every disagreement between the rulebooks bound by a declaration and the delivery that those rulebooks
 * declare. A disagreement does not throw: Each is reported to the reader as a line, because a binding and a
 * `delivery` are written by different people and a run whose output is correct must not fail over their disagreement.
 *
 * Order is fixed so that both reports render alike: The bound findings follow the bindings in declaration order, each
 * hook's own finding ahead of its rulebooks', and the unbound ones follow `resolved`, whose order the closure walk
 * fixes.
 */
export function findGuidanceHookAdvisories(
  bindings: ReadonlyMap<string, ReadonlyArray<string>>,
  resolved: ReadonlyArray<ResolvedRulebook>,
  declaredHooks: ReadonlySet<string>,
): ReadonlyArray<GuidanceHookAdvisory> {
  const bySlug = indexRulebooksBySlug(resolved);
  const advisories: Array<GuidanceHookAdvisory> = [];
  const boundSlugs = new Set<string>();

  for (const [hook, slugs] of bindings) {
    // Reported once for the hook rather than per rulebook: The binding delivers nothing, whatever it names.
    if (!declaredHooks.has(hook)) {
      advisories.push({ kind: 'bound-unreached', hook });
    }
    for (const slug of slugs) {
      boundSlugs.add(slug);
      const rulebook = readBoundRulebook(bySlug, slug, hook);
      if (!rulebook.hook) {
        advisories.push({ kind: 'bound-undeclared', slug, hook });
      }
    }
  }

  for (const rulebook of resolved) {
    // Measured against every hook's bindings at once: A rulebook bound anywhere has taken the route that it declares.
    if (rulebook.hook && !boundSlugs.has(rulebook.slug)) {
      advisories.push({ kind: 'declared-unbound', slug: rulebook.slug });
    }
  }

  return advisories;
}

/**
 * A disagreement between what a declaration's guidance-hook bindings do and what they find: a rulebook whose
 * `delivery` does not match the binding, or a hook not declared by any body. Every kind is advisory: A rulebook's
 * delivery is written by its author and a binding by its consumer, so a mismatch is not always the consumer's to fix
 * and never fails their run.
 *
 * `bound-unreached` is keyed on the hook rather than a rulebook, because one mistyped hook name leaves every
 * rulebook bound under it undelivered at once.
 */
export type GuidanceHookAdvisory =
  | { readonly kind: 'bound-undeclared'; readonly slug: string; readonly hook: string }
  | { readonly kind: 'bound-unreached'; readonly hook: string }
  | { readonly kind: 'declared-unbound'; readonly slug: string };

// region | Helpers

/**
 * Returns the resolved rulebook that a binding names. A binding seeds the closure, so its absence here is a defect in
 * this command rather than in what the user declared, and it is reported as one.
 */
function readBoundRulebook(
  bySlug: ReadonlyMap<string, ResolvedRulebook>,
  slug: string,
  hook: string,
): ResolvedRulebook {
  const rulebook = bySlug.get(slug);
  if (rulebook === undefined) {
    throw new Error(`Rulebook "${slug}", bound to guidance hook "${hook}", did not reach the deploy closure.`);
  }
  return rulebook;
}

// endregion | Helpers
