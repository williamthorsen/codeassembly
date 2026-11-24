import { describe, expect, it } from 'vitest';

import { nameStoredFile } from '../stored-file-name.ts';

describe(nameStoredFile, () => {
  it('drops `.prompt-logic.json` from a prompt-logic file', () => {
    expect(nameStoredFile('Expense claims.prompt-logic.json')).toBe('Expense claims');
  });

  it('drops `.agent-logic.json` from a file written under the earlier name', () => {
    expect(nameStoredFile('Expense claims.agent-logic.json')).toBe('Expense claims');
  });

  it('keeps a name that is only the suffix, or that lacks it', () => {
    expect(nameStoredFile('.prompt-logic.json')).toBe('.prompt-logic.json');
    expect(nameStoredFile('Reset passwords.md')).toBe('Reset passwords.md');
  });
});
