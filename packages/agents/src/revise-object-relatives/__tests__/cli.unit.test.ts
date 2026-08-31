import { describe, expect, it } from 'vitest';

import { parseArgs, runDetect } from '../cli.ts';

describe(parseArgs, () => {
  it('reads every argument as a path narrowing the sweep', () => {
    expect(parseArgs(['docs', 'packages/agents/README.md'])).toStrictEqual({
      paths: ['docs', 'packages/agents/README.md'],
    });
  });

  it('reads no argument as the whole repository', () => {
    expect(parseArgs([])).toStrictEqual({ paths: [] });
  });

  it('refuses a flag, since the helper recognizes none', () => {
    expect(() => parseArgs(['--apply'])).toThrow(/unknown flag/i);
  });
});

describe(runDetect, () => {
  it('reports an unknown flag as a structured failure rather than a throw', async () => {
    const result = await runDetect({ argv: ['--apply'], root: process.cwd() });

    expect(result).toStrictEqual({ ok: false, error: 'invalid-args', message: expect.stringMatching(/unknown flag/i) });
  });
});
