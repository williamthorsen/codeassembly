import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCheck } from '../cli.ts';
import type { CheckInput, CheckReport, CheckSuccess, HelperFailure } from '../types.ts';

const GUIDE = 'docs/guide.md';

describe(runCheck, () => {
  let repository: string;

  beforeEach(async () => {
    repository = await realpath(await mkdtemp(path.join(tmpdir(), 'streamline-check-')));
    execFileSync('git', ['-C', repository, 'init', '--quiet']);
  });

  afterEach(async () => {
    await rm(repository, { recursive: true, force: true });
  });

  it("lists the commits that changed a phrase's occurrence in its file, newest first", async () => {
    const phrase = 'Keep the reinforcement at the output step.';
    await commitFile(GUIDE, `# Guide\n\n${phrase}\n`, 'Add the guide');
    await commitFile(GUIDE, '# Guide\n', 'Remove the reinforcement');
    await commitFile(GUIDE, '# Guide\n\nAn unrelated line.\n', 'Add an unrelated line');
    await commitFile(GUIDE, `# Guide\n\nAn unrelated line.\n\n${phrase}\n`, 'Restore the reinforcement');

    const [report] = expectReports(check({ file: GUIDE, phrase }));

    expect(report?.history.map((commit) => commit.subject)).toStrictEqual([
      'Restore the reinforcement',
      'Remove the reinforcement',
      'Add the guide',
    ]);
  });

  it('finds the history of a phrase containing quotes and backticks', async () => {
    const phrase = 'Run `nmr fmt` and don\'t "skip" it: $(date).';
    await commitFile(GUIDE, `${phrase}\n`, 'Add the formatting rule');

    const [report] = expectReports(check({ file: GUIDE, phrase }));

    expect(report?.history.map((commit) => commit.subject)).toStrictEqual(['Add the formatting rule']);
  });

  it('reports the test string literals that a phrase contains, and no literal outside a test', async () => {
    await commitFile(
      'src/__tests__/guide.unit.test.ts',
      "import { expect } from 'vitest';\n\nexpect(body).toContain('**Number every option**');\nexpect(body).toContain('absent from the phrase');\n",
      'Add the guide test',
    );
    await commitFile('src/guide.ts', "export const RULE = '**Number every option**';\n", 'Add the rule constant');

    const [report] = expectReports(
      check({ file: GUIDE, phrase: 'Rule: **Number every option**. The number is how the user selects.' }),
    );

    expect(report?.assertedBy).toStrictEqual([
      { file: 'src/__tests__/guide.unit.test.ts', line: 3, literal: '**Number every option**' },
    ]);
  });

  it('if the input is malformed, fails as invalid-input', () => {
    expect(runCheck({ cwd: repository, inputJson: '{"cuts":[{"file":"docs/guide.md"}]}' })).toMatchObject({
      ok: false,
      error: 'invalid-input',
    });
  });

  /** Runs `check` over the given cuts from the repository root. */
  function check(...cuts: CheckInput[]): CheckSuccess | HelperFailure {
    return runCheck({ cwd: repository, inputJson: JSON.stringify({ cuts }) });
  }

  /** Writes a file and commits it alone under the given subject. */
  async function commitFile(file: string, content: string, subject: string): Promise<void> {
    await mkdir(path.dirname(path.join(repository, file)), { recursive: true });
    await writeFile(path.join(repository, file), content, 'utf8');
    execFileSync('git', ['-C', repository, 'add', file]);
    execFileSync('git', [
      '-C',
      repository,
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test',
      'commit',
      '--quiet',
      '--message',
      subject,
    ]);
  }
});

// region | Helpers

/** Narrows a result to its reports, failing the test with the failure's message otherwise. */
function expectReports(result: CheckSuccess | HelperFailure): CheckReport[] {
  if (!result.ok) {
    throw new Error(`expected success, got ${result.error}: ${result.message}`);
  }
  return result.reports;
}

// endregion | Helpers
