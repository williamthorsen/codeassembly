import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Returns an invocation that pipes PR JSON whose body has a reference in inline code ahead of a closing keyword, and
 * asserts that the helper selects the keyword reference.
 */
export function makeSelectPrTicketSmokeTest(): SmokeTestInvocation {
  return {
    stdin: JSON.stringify({ body: 'See `#1`.\n\nCloses #42', closingIssuesReferences: [] }),
    assertResult: assertKeywordSelection,
  };
}

// region | Helpers

/** Asserts that the parsed smoke-test result selects issue 42 by its closing keyword. */
function assertKeywordSelection(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result');
  }
  if (result.number !== 42 || result.source !== 'body-keyword') {
    throw new Error(`expected { number: 42, source: 'body-keyword' }, got ${JSON.stringify(result)}`);
  }
}

// endregion | Helpers
