import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runConvertCommand } from '../convert-command.ts';

describe(runConvertCommand, () => {
  let root = '';

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'convert-command-'));
    writeFileSync(path.join(root, 'prompt.md'), 'Greet the user.');
    writeFileSync(path.join(root, 'draft.json'), JSON.stringify({ outOfScope: { reason: 'Nothing to chart' } }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('exits 2, the code for wrong arguments, when it cannot write a file', () => {
    const output = runConvertCommand([
      '--problems-file',
      path.join(root, 'missing', 'problems.json'),
      path.join(root, 'prompt.md'),
      path.join(root, 'draft.json'),
      path.join(root, 'prompt.agent-logic.json'),
    ]);

    expect(output.exitCode).toBe(2);
    expect(output.stderr).toContain('pass a path in a directory that exists and is writable');
  });
});
