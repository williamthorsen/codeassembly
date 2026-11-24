import { describe, expect, it } from 'vitest';

import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import { buildStoredUploadName, buildStoredUploadText } from '../stored-upload.ts';

const CONFIG = buildMinimalConfig();

describe(buildStoredUploadName, () => {
  it.each([
    ['greeting.prompt-logic.json', 'greeting.prompt-logic.json'],
    ['chart.json', 'chart.prompt-logic.json'],
    ['a.b.json', 'a.b.prompt-logic.json'],
    ['chart', 'chart.prompt-logic.json'],
    ['.json', 'json.prompt-logic.json'],
    ['my  first (draft).json', 'my-first-draft-.prompt-logic.json'],
    ['.hidden.prompt-logic.json', 'hidden.prompt-logic.json'],
    ['.prompt-logic.json', 'prompt.prompt-logic.json'],
    ['greeting.agent-logic.json', 'greeting.prompt-logic.json'],
  ])('stores the file %j as %j', (fileName, expected) => {
    expect(buildStoredUploadName({ kind: 'file', fileName }, CONFIG)).toBe(expected);
  });

  it('stores pasted text under its config’s id, without doubling the suffix', () => {
    expect(buildStoredUploadName({ kind: 'paste' }, { ...CONFIG, id: 'support agent' })).toBe(
      'support-agent.prompt-logic.json',
    );
    expect(buildStoredUploadName({ kind: 'paste' }, { ...CONFIG, id: 'support.prompt-logic.json' })).toBe(
      'support.prompt-logic.json',
    );
  });

  it('falls back to `prompt` for an id that sanitizes to nothing', () => {
    expect(buildStoredUploadName({ kind: 'paste' }, { ...CONFIG, id: '…' })).toBe('prompt.prompt-logic.json');
  });
});

describe(buildStoredUploadText, () => {
  it('serializes the value with two-space indents and a trailing newline', () => {
    expect(buildStoredUploadText({ id: 'agent', states: {} })).toBe('{\n  "id": "agent",\n  "states": {}\n}\n');
  });
});
