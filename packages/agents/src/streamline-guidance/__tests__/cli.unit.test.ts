import { describe, expect, it } from 'vitest';

import { runCommand } from '../cli.ts';

describe(runCommand, () => {
  it.each([
    { argv: [], condition: 'the command is omitted' },
    { argv: ['sweep', 'AGENTS.md'], condition: 'the command is unknown' },
    { argv: ['resolve'], condition: 'resolve does not name any path' },
    { argv: ['resolve', '--level', 'AGENTS.md'], condition: 'resolve is given a flag' },
    { argv: ['check', 'AGENTS.md'], condition: 'check is given an argument' },
    { argv: ['mark', 'AGENTS.md'], condition: 'mark is given an argument' },
    { argv: ['record', 'AGENTS.md'], condition: 'record is given an argument' },
  ])('if $condition, fails as invalid-args', async ({ argv }) => {
    const result = await runCommand({
      argv,
      cwd: '/nonexistent',
      home: '/nonexistent',
      readStdin: () => Promise.resolve('{"cuts":[]}'),
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid-args' });
  });
});
