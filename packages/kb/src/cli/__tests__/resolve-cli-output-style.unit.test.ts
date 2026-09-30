import { describe, expect, it } from 'vitest';

import { resolveCliOutputStyle } from '../resolve-cli-output-style.ts';

describe(resolveCliOutputStyle, () => {
  it('removes every occurrence of the flag in both forms, keeping the other arguments in order', () => {
    const result = resolveCliOutputStyle({
      argv: ['--output-style', 'plain', 'check', '--output-style=rich', '--json'],
      env: {},
      isTty: false,
    });

    expect(result).toEqual({ ok: true, argv: ['check', '--json'], style: 'rich' });
  });

  it('leaves the flag in place after `--`', () => {
    const result = resolveCliOutputStyle({ argv: ['check', '--', '--output-style', 'rich'], env: {}, isTty: false });

    expect(result).toEqual({ ok: true, argv: ['check', '--', '--output-style', 'rich'], style: 'plain' });
  });

  it('reports a spaced flag without a value', () => {
    expect(resolveCliOutputStyle({ argv: ['check', '--output-style'], env: {}, isTty: true })).toEqual({
      ok: false,
      message: '--output-style requires a value',
    });
    expect(resolveCliOutputStyle({ argv: ['--output-style', '--json'], env: {}, isTty: true })).toEqual({
      ok: false,
      message: '--output-style requires a value',
    });
  });

  it('reports a KB_OUTPUT_STYLE value that names no style', () => {
    expect(resolveCliOutputStyle({ argv: ['check'], env: { KB_OUTPUT_STYLE: 'loud' }, isTty: true })).toEqual({
      ok: false,
      message: 'KB_OUTPUT_STYLE must be one of: auto, plain, rich (got "loud")',
    });
  });
});
