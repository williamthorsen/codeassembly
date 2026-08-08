import { describe, expect, it } from 'vitest';

import { takeInlineValue, takeValue } from '../parse-flag-value.ts';

describe(takeInlineValue, () => {
  it('reads the value following the prefix', () => {
    expect(takeInlineValue('--kb=coding', '--kb=')).toBe('coding');
  });

  it('throws when the value is empty', () => {
    expect(() => takeInlineValue('--kb=', '--kb=')).toThrow('--kb requires a value');
  });
});

describe(takeValue, () => {
  it('reads the argument following the flag', () => {
    expect(takeValue(['--kb', 'coding'], 0, '--kb')).toBe('coding');
  });

  it('throws when the flag is the last argument', () => {
    expect(() => takeValue(['--kb'], 0, '--kb')).toThrow('--kb requires a value');
  });

  it('throws when the value is empty', () => {
    expect(() => takeValue(['--kb', ''], 0, '--kb')).toThrow('--kb requires a value');
  });

  it('throws when the next argument is another flag', () => {
    expect(() => takeValue(['--kb', '--vs'], 0, '--kb')).toThrow('--kb requires a value');
  });
});
