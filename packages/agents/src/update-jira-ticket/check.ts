// Pure orchestrator. Tokenizes the input once, runs every rule against the token stream, and assembles the
// discriminated-union payload. No I/O — `cli.ts` is responsible for reading stdin and writing stdout.

import { tokenize } from './parser.ts';
import { ALL_RULES } from './rules.ts';
import type { CheckResult } from './types.ts';

/** Validate `html` against every rule. Returns `{ ok: true }` for a clean payload or `{ ok: false, findings }`. */
export function check(html: string): CheckResult {
  const tokens = tokenize(html);
  const findings = ALL_RULES.flatMap((rule) => rule(tokens, html));
  if (findings.length === 0) return { ok: true };
  return { ok: false, findings };
}
