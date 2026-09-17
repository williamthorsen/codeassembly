/** Stable identifier for a rule class. The skill body matches on these strings, so renaming one breaks the skill. */
export type RuleId =
  'composition-code-inline-mark' | 'named-entity' | 'confluence-construct' | 'pre-multiline' | 'disallowed-element';

/** A single rule violation. `line` is 1-based. */
export interface Finding {
  rule: RuleId;
  snippet: string;
  line?: number;
  fix: string;
}

/** Payload emitted to stdout. */
export type CheckResult = { ok: true } | { ok: false; findings: Finding[] };
