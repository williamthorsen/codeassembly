import { describe, expect, it } from 'vitest';

import { run } from '../run.ts';

describe(run, () => {
  it.each([[[]], [['--help']], [['-h']]])('prints usage and exits 0 for %j', (argv) => {
    const output = run(argv);

    expect(output.exitCode).toBe(0);
    expect(output.stdout).toContain('Usage: agent-logic');
    expect(output.stderr).toBe('');
  });

  it('names an unknown command and exits 1', () => {
    const output = run(['convert']);

    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('unknown command: convert');
    expect(output.stdout).toBe('');
  });
});
