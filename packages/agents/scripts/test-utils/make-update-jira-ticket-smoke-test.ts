import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Returns a `SmokeTestInvocation` that pipes an HTML fragment wrapping inline code in bold — a composition violation —
 * and asserts the checker reports a `composition-code-inline-mark` finding.
 */
export function makeUpdateJiraTicketSmokeTest(): SmokeTestInvocation {
  return {
    stdin: '<p><strong><code>x</code></strong></p>',
    assertResult: assertCompositionViolationFinding,
  };
}

// region | Helpers

/** Assert the parsed smoke-test result reports a composition-code-inline-mark finding. */
function assertCompositionViolationFinding(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result');
  }
  if (result.ok !== false) {
    throw new Error(`expected ok: false, got ${JSON.stringify(result.ok)}`);
  }
  const findings = result.findings;
  if (!Array.isArray(findings) || findings.length === 0) {
    throw new Error('expected non-empty findings array');
  }
  const rules = findings.map((entry: unknown) => (isRecord(entry) ? entry.rule : undefined));
  if (!rules.includes('composition-code-inline-mark')) {
    throw new Error(`expected composition-code-inline-mark finding; got rules: ${JSON.stringify(rules)}`);
  }
}

// endregion | Helpers
