import type { GuidanceHookFill, GuidanceHookFills } from '../../lib/guidance-hooks.ts';
import { indexRulebooksBySlug, type ResolvedRulebook } from '../../lib/rulebook-deploy.ts';
import { renderRulebookBody } from '../../lib/rulebook-transform.ts';
import type { HarnessId } from '../../lib/types.ts';
import type { ResolveRulebookContext } from './render-contexts.ts';

/**
 * Renders one harness's guidance-hook fills: each bound rulebook's body through the rulebook renderer, keyed by the
 * hook it fills and ordered as the declaration bound it. Rendering here rather than at the splice is what makes the
 * spliced body position-independent, since link targets and invocation tokens are resolved before it moves.
 */
export function buildGuidanceHookFills(
  bindings: ReadonlyMap<string, ReadonlyArray<string>>,
  resolved: ReadonlyArray<ResolvedRulebook>,
  harnessId: HarnessId,
  resolveRulebookContext: ResolveRulebookContext,
): GuidanceHookFills {
  const bySlug = indexRulebooksBySlug(resolved);
  const fills = new Map<string, ReadonlyArray<GuidanceHookFill>>();
  for (const [hook, slugs] of bindings) {
    fills.set(
      hook,
      slugs.flatMap((slug) => {
        // A bound rulebook rejected by the resolution or render gate is left out rather than raised again here: its own
        // defect names it, and the run fails on the collected list before anything is written.
        const rulebook = bySlug.get(slug);
        if (rulebook === undefined) {
          return [];
        }
        try {
          const context = resolveRulebookContext(harnessId, rulebook.source);
          return [{ slug, body: renderRulebookBody(rulebook.body, slug, context), version: rulebook.version }];
        } catch {
          return [];
        }
      }),
    );
  }
  return fills;
}

/**
 * Collects every disagreement between the rulebooks a declaration binds and the delivery those rulebooks declare.
 * No disagreement throws: Each reaches the reader as a report line, because a binding and a `delivery` are written by
 * different people and a run whose output is correct must not fail over their disagreement.
 *
 * Order is fixed so both reports render alike: The bound findings follow the bindings in declaration order, each
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
    // Measured against every hook's bindings at once: A rulebook bound anywhere has taken the route it declares.
    if (rulebook.hook && !boundSlugs.has(rulebook.slug)) {
      advisories.push({ kind: 'declared-unbound', slug: rulebook.slug });
    }
  }

  return advisories;
}

/**
 * A disagreement between what a declaration's guidance-hook bindings do and what they find: a rulebook whose
 * `delivery` answers the binding differently, or a hook no body declares. Every kind is advisory: A rulebook's
 * delivery is written by its author and a binding by its consumer, so a mismatch is not always the consumer's to fix
 * and never fails their run.
 *
 * `bound-unreached` is keyed on the hook rather than a rulebook, because one mistyped hook name strands every
 * rulebook bound under it at once.
 */
export type GuidanceHookAdvisory =
  | { readonly kind: 'bound-undeclared'; readonly slug: string; readonly hook: string }
  | { readonly kind: 'bound-unreached'; readonly hook: string }
  | { readonly kind: 'declared-unbound'; readonly slug: string };

// region | Helpers

/**
 * Returns the resolved rulebook a binding names. A binding seeds the closure, so its absence here is a defect in this
 * command rather than in what the user declared, and it is reported as one.
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
