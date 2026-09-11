import { describe, expect, it } from 'vitest';

import { runCommand } from '../cli.ts';

describe(runCommand, () => {
  it.each([
    { argv: [], condition: 'no command is given' },
    { argv: ['sweep', 'AGENTS.md'], condition: 'the command is unknown' },
    { argv: ['resolve'], condition: 'resolve names no path' },
    { argv: ['resolve', '--level', 'AGENTS.md'], condition: 'resolve is given a flag' },
  ])('if $condition, fails as invalid-args', async ({ argv }) => {
    const result = await runCommand({ argv, cwd: '/nonexistent', home: '/nonexistent' });

    expect(result).toMatchObject({ ok: false, error: 'invalid-args' });
  });
});
