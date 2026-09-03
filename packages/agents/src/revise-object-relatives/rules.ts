/**
 * The rule registry: which detector reports each rule's sites.
 *
 * A rule lives here because it has a detector. A unit, whose coverage the record tracks, need not have one, and no
 * unit appears in this file. The helper reads no rule document, so what a rule *says* is the skill's to hold; what a
 * rule *finds* is here.
 */
import { detectEmDashes } from './detect-em-dash.ts';
import { detectObjectRelatives } from './detect-object-relative.ts';
import type { Candidate, ProseSpan, RuleId } from './types.ts';

/** Every rule the helper detects, mapped to the detector that reports its sites. */
export const RULE_DETECTORS: Readonly<Record<RuleId, (spans: readonly ProseSpan[]) => Candidate[]>> = {
  'em-dash': detectEmDashes,
  'reduced-object-relative': detectObjectRelatives,
};

/** Every rule the helper detects, for the messages that name the known set. A test holds it to the registry. */
export const RULE_IDS: ReadonlyArray<RuleId> = ['em-dash', 'reduced-object-relative'];

/**
 * Runs the named rules' detectors over every span and returns their candidates in reading order: by file in the order
 * the sweep resolved them, then by line. Sorting is stable, so a single-rule run yields exactly what that detector
 * returned.
 */
export function detectRules(spans: readonly ProseSpan[], rules: readonly RuleId[]): Candidate[] {
  const fileOrder = new Map<string, number>();
  for (const span of spans) {
    if (!fileOrder.has(span.file)) fileOrder.set(span.file, fileOrder.size);
  }

  const candidates = rules.flatMap((rule) => RULE_DETECTORS[rule](spans));
  return candidates.toSorted((a, b) => (fileOrder.get(a.file) ?? 0) - (fileOrder.get(b.file) ?? 0) || a.line - b.line);
}

/** Reports whether a name is a rule the helper holds a detector for. */
export function isRuleId(name: string): name is RuleId {
  return Object.hasOwn(RULE_DETECTORS, name);
}
