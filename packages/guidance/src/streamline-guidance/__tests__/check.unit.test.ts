import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCheck } from '../cli.ts';
import type { StreamlineGit } from '../git.ts';
import { makeFakeGit } from '../test-utils/make-fake-git.ts';
import type { CheckInput, CheckReport, CheckSuccess, HelperFailure, PhraseCommit } from '../types.ts';

const GUIDE = 'docs/guide.md';

describe(runCheck, () => {
  let repository: string;

  beforeEach(async () => {
    repository = await realpath(await mkdtemp(path.join(tmpdir(), 'streamline-check-')));
  });

  afterEach(async () => {
    await rm(repository, { recursive: true, force: true });
  });

  it("reports each cut's phrase history as git returns it", () => {
    const phrase = 'Keep the reinforcement at the output step.';
    const commits: PhraseCommit[] = [
      { sha: 'b'.repeat(40), date: '2026-09-02T00:00:00Z', subject: 'Restore the reinforcement', body: '' },
      { sha: 'a'.repeat(40), date: '2026-09-01T00:00:00Z', subject: 'Add the guide', body: 'Why.' },
    ];
    const git = makeFakeGit({ topLevel: repository, histories: [{ file: GUIDE, phrase, commits }] });

    const reports = expectReports(check(git, { file: GUIDE, phrase }, { file: GUIDE, phrase: 'Another phrase.' }));

    expect(reports.map((report) => report.history)).toStrictEqual([commits, []]);
  });

  it('reports the test string literals that a phrase contains, and omits the literals outside a test', async () => {
    const files = {
      'src/__tests__/guide.unit.test.ts':
        "import { expect } from 'vitest';\n\nexpect(body).toContain('**Number every option**');\nexpect(body).toContain('absent from the phrase');\n",
      'src/guide.ts': "export const RULE = '**Number every option**';\n",
    };
    for (const [file, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(repository, file)), { recursive: true });
      await writeFile(path.join(repository, file), content, 'utf8');
    }
    const git = makeFakeGit({ topLevel: repository, files: Object.keys(files) });

    const [report] = expectReports(
      check(git, { file: GUIDE, phrase: 'Rule: **Number every option**. The number is how the user selects.' }),
    );

    expect(report?.assertedBy).toStrictEqual([
      { file: 'src/__tests__/guide.unit.test.ts', line: 3, literal: '**Number every option**' },
    ]);
  });

  it('if the input is malformed, fails as invalid-input', () => {
    const result = runCheck(
      { cwd: repository, inputJson: '{"cuts":[{"file":"docs/guide.md"}]}' },
      makeFakeGit({ topLevel: repository }),
    );

    expect(result).toMatchObject({ ok: false, error: 'invalid-input' });
  });

  it('if the working directory is not in a repository, fails as not-a-repository', () => {
    expect(check(makeFakeGit({}), { file: GUIDE, phrase: 'A phrase.' })).toMatchObject({
      ok: false,
      error: 'not-a-repository',
    });
  });

  /** Runs `check` over the given cuts from the repository root. */
  function check(git: StreamlineGit, ...cuts: CheckInput[]): CheckSuccess | HelperFailure {
    return runCheck({ cwd: repository, inputJson: JSON.stringify({ cuts }) }, git);
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
