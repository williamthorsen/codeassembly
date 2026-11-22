import { describe, expect, it } from 'vitest';

import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import { buildStoredUploadName, buildStoredUploadText } from '../stored-upload.ts';

const CONFIG = buildMinimalConfig();

describe(buildStoredUploadName, () => {
  it.each([
    ['greeting.agent-logic.json', 'greeting.agent-logic.json'],
    ['chart.json', 'chart.agent-logic.json'],
    ['a.b.json', 'a.b.agent-logic.json'],
    ['chart', 'chart.agent-logic.json'],
    ['.json', 'json.agent-logic.json'],
    ['my  first (draft).json', 'my-first-draft-.agent-logic.json'],
    ['.hidden.agent-logic.json', 'hidden.agent-logic.json'],
    ['.agent-logic.json', 'agent.agent-logic.json'],
  ])('stores the file %j as %j', (fileName, expected) => {
    expect(buildStoredUploadName({ kind: 'file', fileName }, CONFIG)).toBe(expected);
  });

  it('stores pasted text under its config’s id, without doubling the suffix', () => {
    expect(buildStoredUploadName({ kind: 'paste' }, { ...CONFIG, id: 'support agent' })).toBe(
      'support-agent.agent-logic.json',
    );
    expect(buildStoredUploadName({ kind: 'paste' }, { ...CONFIG, id: 'support.agent-logic.json' })).toBe(
      'support.agent-logic.json',
    );
  });

  it('falls back to `agent` for an id that sanitizes to nothing', () => {
    expect(buildStoredUploadName({ kind: 'paste' }, { ...CONFIG, id: '…' })).toBe('agent.agent-logic.json');
  });
});

describe(buildStoredUploadText, () => {
  it('serializes the value with two-space indents and a trailing newline', () => {
    expect(buildStoredUploadText({ id: 'agent', states: {} })).toBe('{\n  "id": "agent",\n  "states": {}\n}\n');
  });
});
