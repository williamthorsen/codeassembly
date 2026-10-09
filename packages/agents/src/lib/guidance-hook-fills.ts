import type { GuidanceHookFill, GuidanceHookFills } from './guidance-hooks.ts';
import { artifactTargetsHarness } from './harness.ts';
import { indexRulebooksBySlug, type ResolvedRulebook } from './rulebook-deploy.ts';
import { renderRulebookBody, type ResolveRulebookContext } from './rulebook-transform.ts';
import type { HarnessId } from './types.ts';

/**
 * Renders one harness's guidance-hook fills: each bound rulebook's body through the rulebook renderer, keyed by the
 * hook that it fills and ordered as the declaration bound it. Rendering here rather than at the splice makes the
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
        // A bound rulebook rejected by resolution or by its own render is left out rather than raised again here: Its
        // own defect names it. One that excludes this harness is left out too, because it does not deploy here.
        const rulebook = bySlug.get(slug);
        if (rulebook === undefined || !artifactTargetsHarness(rulebook, harnessId)) {
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
