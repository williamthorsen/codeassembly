// Shapes for the update-jira-ticket pre-flight checker.
//
// The checker's stdout payload is a discriminated union on `ok`. Clean payloads return `{ ok: true }`;
// payloads with detectable problems return `{ ok: false, findings: [...] }`. Both exit 0 — only invocation
// errors (unreadable stdin, unknown flag) exit non-zero with a stderr message.

/** Stable identifier for a rule class. The skill body, tests, and stdout payload all reference these. */
export type RuleId =
  'composition-code-inline-mark' | 'named-entity' | 'confluence-construct' | 'pre-multiline' | 'disallowed-element';

/** A single rule violation. `line` is best-effort (1-based, from the offset of the offending construct). */
export interface Finding {
  rule: RuleId;
  snippet: string;
  line?: number;
  fix: string;
}

/** Payload emitted to stdout. Clean payloads have no `findings` field. */
export type CheckResult = { ok: true } | { ok: false; findings: Finding[] };
