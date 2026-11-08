import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { problemsFileSchema } from '../../contract/conversion-job.ts';
import { outOfScopeSchema } from '../../convert/draft-schema.ts';

const BIN_ENTRY = path.join(import.meta.dirname, '../index.ts');
const PROMPT = 'Greet the user. Then finish.';
const DRAFT = {
  initial: 'greeting',
  states: {
    greeting: { always: { target: '#done', meta: { quote: 'Then finish' } }, meta: { quote: 'Greet the user' } },
    done: { type: 'final', meta: { quote: 'finish' } },
  },
  meta: { unconverted: [] },
};

describe('agent-logic convert --problems-file', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'convert-prompt-cli-'));
    await writeFile(path.join(root, 'greeter.md'), PROMPT);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes the problems of a draft that cannot be converted, and no config', async () => {
    const draft = { ...DRAFT, states: { ...DRAFT.states, done: { type: 'final', meta: { quote: 'stop' } } } };

    const status = runConvert(root, draft);

    expect(status).toBe(1);
    const { problems } = problemsFileSchema.parse(JSON.parse(await readFile(path.join(root, 'problems.json'), 'utf8')));
    expect(problems.map((problem) => problem.path)).toContain('states.done.meta.quote');
    expect(existsSync(path.join(root, 'greeter.agent-logic.json'))).toBe(false);
  });

  it('writes the verdict of an out-of-scope draft, exits 3, and leaves the output path alone', async () => {
    const outputPath = path.join(root, 'greeter.agent-logic.json');
    await writeFile(outputPath, 'earlier');

    const status = runConvert(root, { outOfScope: { reason: 'It states no steps.' } });

    expect(status).toBe(3);
    const body: unknown = JSON.parse(await readFile(path.join(root, 'problems.json'), 'utf8'));
    expect(outOfScopeSchema.parse(body)).toStrictEqual({ outOfScope: { reason: 'It states no steps.' } });
    expect(await readFile(outputPath, 'utf8')).toBe('earlier');
  });

  it('deletes the problems file of an earlier run once the draft converts', async () => {
    await writeFile(path.join(root, 'problems.json'), '{"problems":[]}');

    const status = runConvert(root, DRAFT);

    expect(status).toBe(0);
    expect(existsSync(path.join(root, 'problems.json'))).toBe(false);
    expect(existsSync(path.join(root, 'greeter.agent-logic.json'))).toBe(true);
  });
});

// region | Helpers
/** Writes the draft and runs the command on it in `root`; returns its exit status. */
function runConvert(root: string, draft: unknown): number | null {
  const draftPath = path.join(root, 'draft.json');
  writeFileSync(draftPath, JSON.stringify(draft));
  return spawnSync(
    process.execPath,
    [
      BIN_ENTRY,
      'convert',
      '--problems-file',
      path.join(root, 'problems.json'),
      path.join(root, 'greeter.md'),
      draftPath,
      path.join(root, 'greeter.agent-logic.json'),
    ],
    { encoding: 'utf8' },
  ).status;
}
// endregion | Helpers
