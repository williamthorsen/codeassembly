import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildFakeRunner } from '../../test-utils/fake-runner.ts';
import { type CommandContext, runCli } from '../cli.ts';
import { LABEL_FAMILIES } from '../labels.ts';
import type { DispositionsRecord } from '../schemas.ts';
import { buildItem, buildRecord } from '../test-utils/build-record.ts';

describe(runCli, () => {
  let root: string;
  let context: CommandContext;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'triage-cli-'));
    const runner = buildFakeRunner(() =>
      JSON.stringify([...LABEL_FAMILIES.confidence, ...LABEL_FAMILIES.value].map((name) => ({ name }))),
    );
    context = { root, run: runner.run };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reports invalid-args for an unknown command, a positional, a repeated flag, and a missing flag', async () => {
    expect(await runCli(['frobnicate'], context)).toMatchObject({ ok: false, error: 'invalid-args' });
    expect(await runCli(['validate', 'extra'], context)).toMatchObject({ ok: false, error: 'invalid-args' });
    expect(await runCli(['validate', '--file', 'a', '--file', 'b'], context)).toMatchObject({
      ok: false,
      error: 'invalid-args',
    });
    expect(await runCli(['validate'], context)).toMatchObject({
      ok: false,
      error: 'invalid-args',
      message: '--file is required',
    });
  });

  describe('check-labels', () => {
    it('reports the families and whether they are complete', async () => {
      const result = await runCli(['check-labels'], context);

      expect(result).toMatchObject({ ok: true, complete: true });
    });

    it('reports gh-failed when gh fails', async () => {
      const failing = { root, run: buildFakeRunner(() => undefined).run };

      expect(await runCli(['check-labels'], failing)).toMatchObject({ ok: false, error: 'gh-failed' });
    });
  });

  describe('validate', () => {
    it('reports the counts and the display order of a record that passes the gate', async () => {
      const result = await runCli(['validate', '--file', writeRecord(root, buildRecord())], context);

      expect(result).toEqual({
        ok: true,
        items: 4,
        byDisposition: { comment: 1, drop: 1, merge: 1, ticket: 1 },
        byConfidence: { low: 1, medium: 3 },
        byValue: { 'nice-to-have': 2, questionable: 1, 'should-have': 1 },
        missingTickets: { items: ['10'], umbrella: true },
        order: ['10', '27', '24', '16'],
      });
    });

    it('reports record-not-found for a missing file and invalid-record for a malformed one', async () => {
      expect(await runCli(['validate', '--file', 'missing.json'], context)).toMatchObject({
        ok: false,
        error: 'record-not-found',
      });
      const notJson = path.join(root, 'bad.json');
      writeFileSync(notJson, '{', 'utf8');
      expect(await runCli(['validate', '--file', notJson], context)).toMatchObject({
        ok: false,
        error: 'invalid-record',
      });
      const wrongShape = path.join(root, 'shape.json');
      writeFileSync(wrongShape, JSON.stringify({ items: [] }), 'utf8');
      expect(await runCli(['validate', '--file', wrongShape], context)).toMatchObject({
        ok: false,
        error: 'invalid-record',
      });
    });

    it('reports every gate violation of a record at once', async () => {
      const record = buildRecord({
        items: [buildItem({ id: 'a', confidence: 'low' }), buildItem({ id: 'b', disposition: 'merge', target: 'zzz' })],
      });

      const result = await runCli(['validate', '--file', writeRecord(root, record)], context);

      expect(result).toMatchObject({
        ok: false,
        error: 'gate-violation',
        message: expect.stringContaining('a: a low item does not take a ticket'),
      });
      expect(result).toMatchObject({ message: expect.stringContaining('b: a merge names the id of another item') });
    });
  });

  describe('render', () => {
    it('refuses while a ticket number is missing, and writes nothing', async () => {
      const result = await runCli(['render', '--file', writeRecord(root, buildRecord()), '--out', 'out'], context);

      expect(result).toMatchObject({
        ok: false,
        error: 'tickets-missing',
        message: expect.stringContaining('the umbrella, 10 do not have a ticket number'),
      });
      expect(existsSync(path.join(root, 'out'))).toBe(false);
    });

    it('renders placeholders under --preview', async () => {
      const result = await runCli(
        ['render', '--file', writeRecord(root, buildRecord()), '--out', 'out', '--preview'],
        context,
      );

      expect(result).toMatchObject({ ok: true, preview: true, issueComments: [{ issue: 272 }] });
      expect(readFileSync(path.join(root, 'out', 'dispositions-comment.md'), 'utf8')).toContain('(pending)');
      expect(readFileSync(path.join(root, 'out', 'comment-272.md'), 'utf8')).toContain('Sign-in error pattern');
    });

    it('renders without an umbrella when the record does not have any item that takes a ticket', async () => {
      const record = buildRecord({ items: [buildItem({ disposition: 'comment', target: 272 })] });

      const result = await runCli(['render', '--file', writeRecord(root, record), '--out', 'out'], context);

      expect(result).toMatchObject({ ok: true, preview: false, issueComments: [{ issue: 272 }] });
    });

    it('writes the comment and the per-issue comments once every number is recorded', async () => {
      const record = buildRecord({
        umbrella: 281,
        items: [buildItem({ ticket: 282 }), buildItem({ id: '24', disposition: 'comment', target: 272 })],
      });

      const result = await runCli(['render', '--file', writeRecord(root, record), '--out', 'out'], context);

      expect(result).toMatchObject({
        ok: true,
        preview: false,
        dispositionsComment: path.join(root, 'out', 'dispositions-comment.md'),
        issueComments: [{ issue: 272, path: path.join(root, 'out', 'comment-272.md') }],
      });
      expect(readFileSync(path.join(root, 'out', 'dispositions-comment.md'), 'utf8')).toContain('#282');
    });
  });
});

// region | Helpers

/** Writes `record` as JSON under `root` and returns its path. */
function writeRecord(root: string, record: DispositionsRecord): string {
  const file = path.join(root, 'dispositions.json');
  writeFileSync(file, JSON.stringify(record), 'utf8');
  return file;
}

// endregion | Helpers
