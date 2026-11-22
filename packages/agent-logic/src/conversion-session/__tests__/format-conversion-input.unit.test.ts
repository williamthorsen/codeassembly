import { describe, expect, it } from 'vitest';

import { formatConversionInput, parseConversionInput } from '../format-conversion-input.ts';

describe(parseConversionInput, () => {
  it.each([
    {
      case: 'a multi-line prompt with blank lines',
      prompt: '# Greeter\n\nSay hello.\n\nPrompt file: x\n',
      name: 'a.md',
    },
    { case: 'an empty prompt', prompt: '', name: 'empty.md' },
    { case: 'an empty name', prompt: 'Say hello.', name: '' },
  ])('returns the prompt and name of $case', ({ prompt, name }) => {
    expect(parseConversionInput(formatConversionInput(prompt, name))).toStrictEqual({ prompt, name });
  });

  it.each([
    { case: 'lacks the header', input: 'Say hello.' },
    { case: 'has only the header line', input: 'Prompt file: a.md' },
    { case: 'does not follow the header with a blank line', input: 'Prompt file: a.md\nSay hello.' },
    { case: 'formats a name that contains a newline', input: formatConversionInput('Say hello.', 'a\nb.md') },
  ])('throws for input that $case', ({ input }) => {
    expect(() => parseConversionInput(input)).toThrow(/must start with a `Prompt file: \{name\}` line/);
  });
});
