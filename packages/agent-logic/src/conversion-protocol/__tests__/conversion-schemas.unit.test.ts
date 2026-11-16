import { describe, expect, it } from 'vitest';

import {
  conversionStateSchema,
  MAX_NAME_LENGTH,
  MAX_PROMPT_BYTES,
  startConversionRequestSchema,
} from '../conversion-schemas.ts';

describe('startConversionRequestSchema', () => {
  it('accepts a prompt of exactly the byte cap', () => {
    expect(startConversionRequestSchema.safeParse({ prompt: 'a'.repeat(MAX_PROMPT_BYTES), name: 'a.md' }).success).toBe(
      true,
    );
  });

  it('rejects a prompt one byte past the cap, measuring multi-byte characters by their bytes', () => {
    // `é` takes 2 bytes in UTF-8, so this prompt is within the cap in characters but past it in bytes.
    const prompt = `${'a'.repeat(MAX_PROMPT_BYTES - 1)}é`;

    expect(startConversionRequestSchema.safeParse({ prompt, name: 'a.md' }).success).toBe(false);
  });

  it('rejects an empty prompt', () => {
    expect(startConversionRequestSchema.safeParse({ prompt: '', name: 'a.md' }).success).toBe(false);
  });

  it('accepts a name of exactly the length cap and rejects one past it', () => {
    const atCap = 'a'.repeat(MAX_NAME_LENGTH);

    expect(startConversionRequestSchema.safeParse({ prompt: 'p', name: atCap }).success).toBe(true);
    expect(startConversionRequestSchema.safeParse({ prompt: 'p', name: `${atCap}a` }).success).toBe(false);
  });

  it('rejects a blank name', () => {
    expect(startConversionRequestSchema.safeParse({ prompt: 'p', name: '  ' }).success).toBe(false);
  });
});

describe('conversionStateSchema', () => {
  it.each([
    {
      status: 'running',
      id: 'c1',
      name: 'a.md',
      startedAt: '2026-11-16T12:00:00.000Z',
      deadline: '2026-11-16T12:10:00.000Z',
    },
    { status: 'done', id: 'c1', name: 'a.md', result: { ok: true, text: '{}\n' } },
    { status: 'done', id: 'c1', name: 'a.md', result: { ok: false, problems: [{ path: '', message: 'm' }] } },
    { status: 'done', id: 'c1', name: 'a.md', result: { ok: false, outOfScope: { reason: 'No steps.' } } },
    { status: 'failed', id: 'c1', name: 'a.md', reason: 'Boom.' },
    { status: 'cancelled', id: 'c1', name: 'a.md' },
  ])('accepts a $status state', (state) => {
    expect(conversionStateSchema.parse(state)).toStrictEqual(state);
  });
});
