import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildHelp, runCli } from '../cli.ts';
import { buildCluster, buildRecord } from '../test-utils/build-record.ts';

/** Writes `record` to a temp directory and returns the directory. */
async function writeRecord(record: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'triage-feedback-'));
  await writeFile(join(dir, 'record.json'), JSON.stringify(record), 'utf8');
  return dir;
}

describe(buildHelp, () => {
  it.each(['validate', 'render', '--file', '--out'])('names %s', (word) => {
    expect(buildHelp()).toContain(word);
  });
});

describe('validate', () => {
  it('reports the surfaced clusters and the pending writes', async () => {
    const cwd = await writeRecord(buildRecord());
    await expect(runCli(['validate', '--file', 'record.json'], { cwd })).resolves.toEqual({
      ok: true,
      clusters: 2,
      surfaced: ['sentence-case'],
      pending: ['sentence-case'],
    });
  });

  it('rejects a record that breaks a rule, listing each violation', async () => {
    const cwd = await writeRecord(
      buildRecord({
        clusters: [buildCluster({ result: { marked: true } })],
        limit: 1,
        remainder: { clusters: 0, events: 0, excluded: 0 },
      }),
    );
    await expect(runCli(['validate', '--file', 'record.json'], { cwd })).resolves.toMatchObject({
      ok: false,
      error: 'rule-violation',
      violations: [{ cluster: 'sentence-case' }],
    });
  });

  it('rejects a record that does not match the schema', async () => {
    const cwd = await writeRecord({ store: 'codeassembly' });
    await expect(runCli(['validate', '--file', 'record.json'], { cwd })).resolves.toMatchObject({
      ok: false,
      error: 'invalid-record',
    });
  });

  it('reports a missing record', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'triage-feedback-'));
    await expect(runCli(['validate', '--file', 'record.json'], { cwd })).resolves.toMatchObject({
      ok: false,
      error: 'record-not-found',
    });
  });
});

describe('render', () => {
  it('writes the artifact body', async () => {
    const cwd = await writeRecord(buildRecord());
    await expect(runCli(['render', '--file', 'record.json', '--out', 'out/artifact.md'], { cwd })).resolves.toEqual({
      ok: true,
      out: join(cwd, 'out', 'artifact.md'),
    });
    await expect(readFile(join(cwd, 'out', 'artifact.md'), 'utf8')).resolves.toContain('# Feedback triage');
  });

  it('requires --out', async () => {
    const cwd = await writeRecord(buildRecord());
    await expect(runCli(['render', '--file', 'record.json'], { cwd })).resolves.toMatchObject({
      ok: false,
      error: 'invalid-args',
    });
  });
});

describe('arguments', () => {
  it('refuses an unknown command', async () => {
    await expect(runCli(['triage'], { cwd: tmpdir() })).resolves.toMatchObject({ ok: false, error: 'invalid-args' });
  });
});
