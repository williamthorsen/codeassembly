// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import type { Finding } from '../../../schema/agent-logic-schema.ts';
import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import { describeLoaded, describeUnknownExample } from '../describe-load-outcome.ts';

describe(describeLoaded, () => {
  it('counts the unconverted passages, then the gaps, and omits a count of zero', () => {
    const config = buildMinimalConfig();
    expect(describeLoaded('Pasted JSON', config)).toBe('Pasted JSON loaded.');

    config.states = { ...config.states, stuck: { id: 'stuck', meta: { source: { start: 0, end: 5 } } } };
    expect(describeLoaded('Pasted JSON', config)).toBe('Pasted JSON loaded. 1 gap listed.');

    config.states = { ...config.states, idle: { id: 'idle', meta: { source: { start: 0, end: 5 } } } };
    config.meta.unconverted = [{ start: 0, end: 5 }];
    expect(describeLoaded('Pasted JSON', config)).toBe(
      'Pasted JSON loaded. 1 unconverted passage listed. 2 gaps listed.',
    );
  });
});

describe('describeLoaded with findings', () => {
  it('counts the findings after the gaps', () => {
    const config = buildMinimalConfig();
    const finding: Finding = { kind: 'contradiction', sources: [{ start: 0, end: 5 }], reason: 'x' };
    config.meta.findings = [finding];
    expect(describeLoaded('Pasted JSON', config)).toBe('Pasted JSON loaded. 1 finding listed.');

    config.states = { ...config.states, stuck: { id: 'stuck', meta: { source: { start: 0, end: 5 } } } };
    config.meta.findings = [finding, finding];
    expect(describeLoaded('Pasted JSON', config)).toBe('Pasted JSON loaded. 1 gap listed. 2 findings listed.');
  });
});

describe(describeUnknownExample, () => {
  it('names the value and the bundled examples', () => {
    expect(describeUnknownExample('nope')).toBe(
      'No example is named “nope”. The examples are Change approval, Password reset, and Refund request.',
    );
  });

  it('names an empty value as empty', () => {
    expect(describeUnknownExample('')).toBe(
      'The URL names an empty example. The examples are Change approval, Password reset, and Refund request.',
    );
  });
});
