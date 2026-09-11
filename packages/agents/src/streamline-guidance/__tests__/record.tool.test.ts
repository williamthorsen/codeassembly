import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runRecord, runResolve } from '../cli.ts';
import { RECORD_PATH } from '../record.ts';

describe(runRecord, () => {
  let repository: string;

  beforeEach(async () => {
    repository = await realpath(await mkdtemp(path.join(tmpdir(), 'streamline-record-')));
    execFileSync('git', ['-C', repository, 'init', '--quiet']);
    await mkdir(path.join(repository, 'docs'), { recursive: true });
    await writeFile(path.join(repository, 'docs/guide.md'), 'Intro sentence.\n\nA rule.\n', 'utf8');
  });

  afterEach(async () => {
    await rm(repository, { recursive: true, force: true });
  });

  it('writes the record that a later resolve reads its declined cuts from', async () => {
    const fold = {
      declinedAt: '2026-09-10',
      declined: [{ file: 'docs/guide.md', phrase: 'Intro sentence.', class: 'conservative' }],
    };

    const written = runRecord({ cwd: repository, foldJson: JSON.stringify(fold) });
    const resolved = await runResolve({ argv: ['docs/guide.md'], cwd: repository, home: repository });

    expect(written).toStrictEqual({ ok: true, path: RECORD_PATH, declined: 1 });
    expect(await readFile(path.join(repository, RECORD_PATH), 'utf8')).toContain('declined-at: 2026-09-10');
    expect(resolved).toMatchObject({ declined: fold.declined });
  });

  it('if the existing record is malformed, fails as invalid-record and leaves it as written', async () => {
    const malformed = 'declined:\n  - file: docs/guide.md\n';
    await mkdir(path.join(repository, '.agents'), { recursive: true });
    await writeFile(path.join(repository, RECORD_PATH), malformed, 'utf8');

    const result = runRecord({ cwd: repository, foldJson: JSON.stringify({ declinedAt: '2026-09-10', declined: [] }) });

    expect(result).toMatchObject({ ok: false, error: 'invalid-record' });
    expect(await readFile(path.join(repository, RECORD_PATH), 'utf8')).toBe(malformed);
  });
});
