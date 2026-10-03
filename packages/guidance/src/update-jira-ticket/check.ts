import { tokenize } from './parser.ts';
import { ALL_RULES } from './rules.ts';
import type { CheckResult } from './types.ts';

/** Validates `html` against every rule. */
export function check(html: string): CheckResult {
  const tokens = tokenize(html);
  const findings = ALL_RULES.flatMap((rule) => rule(tokens, html));
  if (findings.length === 0) return { ok: true };
  return { ok: false, findings };
}
