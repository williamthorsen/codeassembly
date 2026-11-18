import { describe, expect, it } from 'vitest';

import { CONVERSION_INSTRUCTIONS } from '../conversion-instructions.ts';
import { readConversionInstructions } from '../write-conversion-instructions.ts';

describe('CONVERSION_INSTRUCTIONS', () => {
  it('matches the instructions in docs/', () => {
    expect(
      CONVERSION_INSTRUCTIONS,
      'The conversion instructions are stale. Run `pnpm run generate:instructions`.',
    ).toBe(readConversionInstructions());
  });
});
