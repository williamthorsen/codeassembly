import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runRecord, runResolve } from '../cli.ts';
import type { StreamlineGit } from '../git.ts';
import { RECORD_PATH } from '../record.ts';
import { makeFakeGit } from '../test-utils/make-fake-git.ts';

const SKILL = 'lib/skills/demo/SKILL.md';
const SKILL_CONTENT = 'A skill.\n';

/** Files staged in the repository, which git lists and reports as changed. */
const REPOSITORY_FILES: Readonly<Record<string, string>> = {
  'docs/guide.md': 'Intro sentence.\n\nA rule.\n',
  'lib/codeassembly-content.yaml': 'format: 2\n',
  [SKILL]: SKILL_CONTENT,
};

describe(runRecord, () => {
  let git: StreamlineGit;
  let repository: string;

  beforeEach(async () => {
    repository = await realpath(await mkdtemp(path.join(tmpdir(), 'streamline-record-')));
    for (const [file, content] of Object.entries(REPOSITORY_FILES)) {
      await mkdir(path.dirname(path.join(repository, file)), { recursive: true });
      await writeFile(path.join(repository, file), content, 'utf8');
    }
    const files = Object.keys(REPOSITORY_FILES);
    git = makeFakeGit({ topLevel: repository, files, changed: files });
  });

  afterEach(async () => {
    await rm(repository, { recursive: true, force: true });
  });

  it('writes the record that a later resolve reads its declined cuts from', async () => {
    const fold = {
      date: '2026-09-10',
      declined: [{ file: 'docs/guide.md', phrase: 'Intro sentence.', class: 'conservative' }],
      reviewed: [],
    };

    const written = await runRecord({ cwd: repository, foldJson: JSON.stringify(fold) }, git);
    const resolved = await runResolve({ argv: ['docs/guide.md'], cwd: repository, home: repository }, git);

    expect(written).toStrictEqual({ ok: true, path: RECORD_PATH, declined: 1, reviewed: 0 });
    expect(await readFile(path.join(repository, RECORD_PATH), 'utf8')).toContain('declined-at: 2026-09-10');
    expect(resolved).toMatchObject({ declined: fold.declined });
  });

  it('records the deployed bytes of each reviewed file, which a later resolve reports as its last review', async () => {
    const fold = { date: '2026-09-10', declined: [], reviewed: [SKILL, 'docs/guide.md', 'docs/missing.md'] };

    const written = await runRecord({ cwd: repository, foldJson: JSON.stringify(fold) }, git);
    const resolved = await runResolve({ argv: [SKILL, 'docs/guide.md'], cwd: repository, home: repository }, git);

    expect(written).toStrictEqual({ ok: true, path: RECORD_PATH, declined: 0, reviewed: 2 });
    expect(resolved).toMatchObject({
      targets: [
        { file: SKILL, lastReview: { reviewedAt: '2026-09-10', deployedBytes: SKILL_CONTENT.length } },
        { file: 'docs/guide.md', lastReview: { reviewedAt: '2026-09-10' } },
      ],
    });
  });

  it('if the existing record is malformed, fails as invalid-record and leaves it as written', async () => {
    const malformed = 'declined:\n  - file: docs/guide.md\n';
    await mkdir(path.join(repository, '.agents'), { recursive: true });
    await writeFile(path.join(repository, RECORD_PATH), malformed, 'utf8');

    const result = await runRecord(
      { cwd: repository, foldJson: JSON.stringify({ date: '2026-09-10', declined: [], reviewed: [] }) },
      git,
    );

    expect(result).toMatchObject({ ok: false, error: 'invalid-record' });
    expect(await readFile(path.join(repository, RECORD_PATH), 'utf8')).toBe(malformed);
  });

  it('if the working directory is not in a repository, fails as not-a-repository', async () => {
    const result = await runRecord(
      { cwd: repository, foldJson: JSON.stringify({ date: '2026-09-10', declined: [], reviewed: [] }) },
      makeFakeGit({}),
    );

    expect(result).toMatchObject({ ok: false, error: 'not-a-repository' });
  });
});
