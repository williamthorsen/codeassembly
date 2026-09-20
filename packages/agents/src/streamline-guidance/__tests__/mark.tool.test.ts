import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listReviewMarkers, readRecordLines } from '../../deployed-sizes/read-record.ts';
import { resolveRecordPath } from '../../deployed-sizes/resolve-record-path.ts';
import { runMark } from '../cli.ts';

const CONTENT_DIR = path.join('packages', 'agents', 'content');

describe(runMark, () => {
  let home: string;
  let repository: string;

  beforeEach(async () => {
    home = await realpath(await mkdtemp(path.join(tmpdir(), 'streamline-mark-home-')));
    repository = await realpath(await mkdtemp(path.join(tmpdir(), 'streamline-mark-')));
    execFileSync('git', ['-C', repository, 'init', '--quiet']);
    await mkdir(path.join(repository, CONTENT_DIR, 'skills', 'plan'), { recursive: true });
    await writeFile(path.join(repository, CONTENT_DIR, 'codeassembly-content.yaml'), 'name: library\n', 'utf8');
    await writeFile(path.join(repository, CONTENT_DIR, 'skills', 'plan', 'SKILL.md'), '# Plan\n', 'utf8');
    await mkdir(path.join(repository, 'docs'), { recursive: true });
    await writeFile(path.join(repository, 'docs', 'guide.md'), '# Guide\n', 'utf8');
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
    await rm(repository, { recursive: true, force: true });
  });

  it('appends one marker to the repository record and one to the home record', async () => {
    const result = await runMark({
      cwd: repository,
      home,
      inputJson: JSON.stringify({
        reviewedAt: '2026-09-19T08:00:00.000Z',
        files: [path.join(CONTENT_DIR, 'skills', 'plan', 'SKILL.md')],
      }),
    });

    const homeRecord = resolveRecordPath({ home, domain: 'home' });
    const repoRecord = resolveRecordPath({ home, domain: 'repo', repo: undefined });

    expect(result).toMatchObject({
      ok: true,
      reviewed: ['skills/plan/SKILL.md'],
      records: [repoRecord, homeRecord],
      unrooted: [],
    });
    for (const record of [homeRecord, repoRecord]) {
      expect(listReviewMarkers(await readRecordLines(record))).toEqual([
        {
          schemaVersion: 1,
          kind: 'review',
          recordedAt: '2026-09-19T08:00:00.000Z',
          reviewed: ['skills/plan/SKILL.md'],
        },
      ]);
    }
  });

  it('reports a file in no content root and keeps the rest of the marker', async () => {
    const result = await runMark({
      cwd: repository,
      home,
      inputJson: JSON.stringify({
        reviewedAt: '2026-09-19T08:00:00.000Z',
        files: [path.join('docs', 'guide.md'), path.join(CONTENT_DIR, 'skills', 'plan', 'SKILL.md')],
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      reviewed: ['skills/plan/SKILL.md'],
      unrooted: [path.join('docs', 'guide.md')],
    });
  });

  it('fails as invalid-input when the review instant is not a timestamp', async () => {
    const result = await runMark({
      cwd: repository,
      home,
      inputJson: JSON.stringify({ reviewedAt: 'yesterday', files: [] }),
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid-input' });
  });

  it('fails as not-a-repository outside a working tree', async () => {
    const outside = await realpath(await mkdtemp(path.join(tmpdir(), 'streamline-mark-outside-')));
    try {
      const result = await runMark({
        cwd: outside,
        home,
        inputJson: JSON.stringify({ reviewedAt: '2026-09-19T08:00:00.000Z', files: [] }),
      });

      expect(result).toMatchObject({ ok: false, error: 'not-a-repository' });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
