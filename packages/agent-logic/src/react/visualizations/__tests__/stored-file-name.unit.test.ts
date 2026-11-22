import { describe, expect, it } from 'vitest';

import { nameStoredFile } from '../stored-file-name.ts';

describe(nameStoredFile, () => {
  it('drops `.agent-logic.json` from an agent-logic file', () => {
    expect(nameStoredFile('Expense claims.agent-logic.json')).toBe('Expense claims');
  });

  it('keeps a name that is only the suffix, or that lacks it', () => {
    expect(nameStoredFile('.agent-logic.json')).toBe('.agent-logic.json');
    expect(nameStoredFile('Reset passwords.md')).toBe('Reset passwords.md');
  });
});
