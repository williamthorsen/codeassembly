import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { parseArgs, runEdit } from '../cli.ts';

const NOW = new Date('2026-05-24T14:35:00Z');
const TODAY = '2026-05-24T14:35:00Z';

const SAMPLE_NOTE = `---
title: Sample
recordType: assertion
created: 2026-05-01
updated: 2026-05-01
tags: [sample]
type: howto
---

Original body.
`;

/** Build a Readable stream that emits the given body and ends. */
function bodyStream(body: string): Readable {
  return Readable.from([Buffer.from(body, 'utf8')]);
}

/** Stand up a temp KB with a single seed note; return paths. */
async function makeKbWithNote(): Promise<{ kbPath: string; notePath: string }> {
  const kbPath = await mkdtemp(join(tmpdir(), 'kb-edit-cli-'));
  await mkdir(join(kbPath, '.kb'), { recursive: true });
  const notePath = join(kbPath, 'Sample.md');
  await writeFile(notePath, SAMPLE_NOTE, 'utf8');
  return { kbPath, notePath };
}

describe(parseArgs, () => {
  it('parses --bump-updated with a positional path', () => {
    const parsed = parseArgs(['notes/foo.md', '--bump-updated']);

    expect(parsed).toEqual({ operation: 'bump-updated', path: 'notes/foo.md' });
  });

  it('parses --verify with a positional path', () => {
    const parsed = parseArgs(['/abs/path/foo.md', '--verify']);

    expect(parsed).toEqual({ operation: 'verify', path: '/abs/path/foo.md' });
  });

  it('parses --append with a positional path', () => {
    const parsed = parseArgs(['foo.md', '--append']);

    expect(parsed).toEqual({ operation: 'append', path: 'foo.md' });
  });

  it('parses --retag with a comma-separated list, trimming whitespace and dropping empties', () => {
    const parsed = parseArgs(['foo.md', '--retag', 'one, two ,three,,']);

    expect(parsed).toEqual({ operation: 'retag', path: 'foo.md', tags: ['one', 'two', 'three'] });
  });

  it('parses --retag with an inline = value', () => {
    const parsed = parseArgs(['foo.md', '--retag=a,b']);

    expect(parsed).toEqual({ operation: 'retag', path: 'foo.md', tags: ['a', 'b'] });
  });

  it('parses --supersede-with as a single value', () => {
    const parsed = parseArgs(['old.md', '--supersede-with', 'new.md']);

    expect(parsed).toEqual({ operation: 'supersede-with', path: 'old.md', newPath: 'new.md' });
  });

  it('parses --supersede-with with an inline = value', () => {
    const parsed = parseArgs(['old.md', '--supersede-with=new.md']);

    expect(parsed).toEqual({ operation: 'supersede-with', path: 'old.md', newPath: 'new.md' });
  });

  it('accepts the operation flag before the positional path', () => {
    const parsed = parseArgs(['--bump-updated', 'foo.md']);

    expect(parsed).toEqual({ operation: 'bump-updated', path: 'foo.md' });
  });

  it('throws when no operation flag is supplied', () => {
    expect(() => parseArgs(['foo.md'])).toThrow(/one operation flag is required/);
  });

  it('throws when two operation flags are combined', () => {
    expect(() => parseArgs(['foo.md', '--bump-updated', '--verify'])).toThrow(/mutually exclusive/);
  });

  it('throws when --retag and --supersede-with are combined', () => {
    expect(() => parseArgs(['foo.md', '--retag', 'a', '--supersede-with', 'new.md'])).toThrow(/mutually exclusive/);
  });

  it('throws when the positional path is missing', () => {
    expect(() => parseArgs(['--bump-updated'])).toThrow(/missing required <path>/);
  });

  it('throws when an extra positional argument is supplied', () => {
    expect(() => parseArgs(['foo.md', 'bar.md', '--bump-updated'])).toThrow(/unexpected extra positional/);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['foo.md', '--bogus'])).toThrow(/unknown flag/);
  });

  it('throws when --retag has no value at all (end of argv)', () => {
    expect(() => parseArgs(['foo.md', '--retag'])).toThrow(/--retag requires a value/);
  });

  it('throws when --retag is followed by another flag instead of a value', () => {
    expect(() => parseArgs(['foo.md', '--retag', '--bump-updated'])).toThrow(/--retag requires a value/);
  });

  it('treats --retag="" as an explicit clear and yields an empty tag list', () => {
    const parsed = parseArgs(['foo.md', '--retag=']);

    expect(parsed).toEqual({ operation: 'retag', path: 'foo.md', tags: [] });
  });

  it('treats --retag "" as an explicit clear and yields an empty tag list', () => {
    const parsed = parseArgs(['foo.md', '--retag', '']);

    expect(parsed).toEqual({ operation: 'retag', path: 'foo.md', tags: [] });
  });

  it('throws when --supersede-with has no value', () => {
    expect(() => parseArgs(['foo.md', '--supersede-with'])).toThrow(/--supersede-with requires a value/);
  });

  it('throws when --supersede-with is given an empty value', () => {
    expect(() => parseArgs(['foo.md', '--supersede-with='])).toThrow(/--supersede-with requires a value/);
  });

  it('parses --add-addressed-by with one path and a comma-separated reference list', () => {
    const parsed = parseArgs(['foo.md', '--add-addressed-by', '[[fix]],#789']);

    expect(parsed).toEqual({ operation: 'add-addressed-by', paths: ['foo.md'], references: ['[[fix]]', '#789'] });
  });

  it('parses --add-addressed-by with multiple positional paths', () => {
    const parsed = parseArgs(['a.md', 'b.md', '--add-addressed-by', '[[fix]]']);

    expect(parsed).toEqual({ operation: 'add-addressed-by', paths: ['a.md', 'b.md'], references: ['[[fix]]'] });
  });

  it('parses --add-addressed-by with an inline = value', () => {
    const parsed = parseArgs(['foo.md', '--add-addressed-by=[[fix]]']);

    expect(parsed).toEqual({ operation: 'add-addressed-by', paths: ['foo.md'], references: ['[[fix]]'] });
  });

  it('trims and drops empties in the --add-addressed-by reference list', () => {
    const parsed = parseArgs(['foo.md', '--add-addressed-by', ' a , b ,,']);

    expect(parsed).toEqual({ operation: 'add-addressed-by', paths: ['foo.md'], references: ['a', 'b'] });
  });

  it('accepts --add-addressed-by before the positional paths', () => {
    const parsed = parseArgs(['--add-addressed-by', '[[fix]]', 'a.md', 'b.md']);

    expect(parsed).toEqual({ operation: 'add-addressed-by', paths: ['a.md', 'b.md'], references: ['[[fix]]'] });
  });

  it('throws when --add-addressed-by has an empty value', () => {
    expect(() => parseArgs(['foo.md', '--add-addressed-by='])).toThrow(/at least one reference/);
  });

  it('throws when --add-addressed-by has only empty reference entries', () => {
    expect(() => parseArgs(['foo.md', '--add-addressed-by', ',,'])).toThrow(/at least one reference/);
  });

  it('throws when --add-addressed-by has no value at all', () => {
    expect(() => parseArgs(['foo.md', '--add-addressed-by'])).toThrow(/--add-addressed-by requires a value/);
  });

  it('throws when --add-addressed-by is supplied with no positional path', () => {
    expect(() => parseArgs(['--add-addressed-by', '[[fix]]'])).toThrow(/missing required <path>/);
  });

  it('still rejects a second positional for a single-target operation', () => {
    expect(() => parseArgs(['foo.md', 'bar.md', '--bump-updated'])).toThrow(/unexpected extra positional/);
  });
});

describe(runEdit, () => {
  it('bumps updated and writes the note', async () => {
    const { kbPath, notePath } = await makeKbWithNote();

    const result = await runEdit({
      argv: [notePath, '--bump-updated'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.operation === 'bump-updated') {
      expect(result.frontmatter.updated).toBe(TODAY);
      const written = await readFile(notePath, 'utf8');
      expect(written).toContain(`updated: ${TODAY}`);
      expect(written).toContain('Original body.');
    }
  });

  it('sets last-verified without bumping updated', async () => {
    const { kbPath, notePath } = await makeKbWithNote();

    const result = await runEdit({
      argv: [notePath, '--verify'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.operation === 'verify') {
      expect(result.frontmatter.extra['last-verified']).toBe(TODAY);
      expect(result.frontmatter.updated).toBe('2026-05-01');
      const written = await readFile(notePath, 'utf8');
      expect(written).toContain(`last-verified: ${TODAY}`);
      expect(written).toContain('updated: 2026-05-01');
    }
  });

  it('replaces tags via --retag without bumping updated and surfaces canonicalization audit', async () => {
    const { kbPath, notePath } = await makeKbWithNote();

    const result = await runEdit({
      argv: [notePath, '--retag', 'one,two,three'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.operation === 'retag') {
      expect(result.originalTags).toEqual(['one', 'two', 'three']);
      expect(result.canonicalTags).toEqual(['one', 'two', 'three']);
      expect(result.frontmatter.tags).toEqual(['one', 'two', 'three']);
      expect(result.frontmatter.updated).toBe('2026-05-01');
      const written = await readFile(notePath, 'utf8');
      expect(written).toContain('updated: 2026-05-01');
    }
  });

  it('appends stdin to the body with a separating blank line and bumps updated', async () => {
    const { kbPath, notePath } = await makeKbWithNote();

    const result = await runEdit({
      argv: [notePath, '--append'],
      stdin: bodyStream('Appended paragraph.\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.operation === 'append') {
      const written = await readFile(notePath, 'utf8');
      expect(written).toContain('Original body.\n\nAppended paragraph.');
      expect(result.frontmatter.updated).toBe(TODAY);
    }
  });

  it('returns invalid-args when --append receives empty stdin', async () => {
    const { kbPath, notePath } = await makeKbWithNote();

    const result = await runEdit({
      argv: [notePath, '--append'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-args');
      expect(result.message).toMatch(/non-empty stdin/);
    }
    // Original file untouched.
    const written = await readFile(notePath, 'utf8');
    expect(written).toBe(SAMPLE_NOTE);
  });

  it('returns note-not-found when the path does not exist', async () => {
    const { kbPath } = await makeKbWithNote();
    const missing = join(kbPath, 'absent.md');

    const result = await runEdit({
      argv: [missing, '--bump-updated'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('note-not-found');
      expect(result.details?.missingPath).toBe(missing);
    }
  });

  it('returns note-parse when the note has malformed YAML', async () => {
    const { kbPath } = await makeKbWithNote();
    const path = join(kbPath, 'broken.md');
    await writeFile(path, '---\ntitle: {broken\n---\n\nBody\n', 'utf8');

    const result = await runEdit({
      argv: [path, '--bump-updated'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('note-parse');
      expect(result.details?.parseError).toMatch(/./);
    }
  });

  it('returns no-kb-resolvable when the note path is not inside any .kb/', async () => {
    const wd = await mkdtemp(join(tmpdir(), 'kb-edit-orphan-'));
    const path = join(wd, 'note.md');
    await writeFile(path, SAMPLE_NOTE, 'utf8');

    const result = await runEdit({
      argv: [path, '--bump-updated'],
      stdin: bodyStream(''),
      startDir: wd,
      now: NOW,
      home: wd,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('no-kb-resolvable');
    }
  });

  it('returns readonly-kb when the note resolves into a readonly registry entry', async () => {
    const { kbPath, notePath } = await makeKbWithNote();
    const homeDir = await mkdtemp(join(tmpdir(), 'kb-edit-readonly-home-'));
    await mkdir(join(homeDir, '.agents'), { recursive: true });
    await writeFile(
      join(homeDir, '.agents', 'kb.yaml'),
      `kbs:\n  locked:\n    path: ${kbPath}\n    readonly: true\n`,
      'utf8',
    );

    const result = await runEdit({
      argv: [notePath, '--bump-updated'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: homeDir,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('readonly-kb');
      expect(result.details?.readonlyKbName).toBe('locked');
      expect(result.details?.readonlyKbPath).toBe(kbPath);
    }
    // Original file untouched.
    const written = await readFile(notePath, 'utf8');
    expect(written).toBe(SAMPLE_NOTE);
  });

  it('returns schema-validation when the result fails frontmatter rules', async () => {
    // Stand up a fixture note with a `recordType` outside the default vocabulary.
    // Bumping `updated:` re-validates the resulting frontmatter, so this surfaces as schema-validation.
    const { kbPath } = await makeKbWithNote();
    const path = join(kbPath, 'bad-record-type.md');
    await writeFile(
      path,
      '---\ntitle: x\nrecordType: rant\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nbody\n',
      'utf8',
    );

    const result = await runEdit({
      argv: [path, '--bump-updated'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('schema-validation');
      expect(result.details?.findings?.some((f) => f.rule === 'frontmatter.recordType')).toBe(true);
    }
  });

  it('commits both writes on --supersede-with and surfaces KB-relative pointers', async () => {
    const { kbPath, notePath: oldPath } = await makeKbWithNote();
    const newPath = join(kbPath, 'New.md');
    await writeFile(newPath, SAMPLE_NOTE.replace('Sample', 'Replacement'), 'utf8');

    const result = await runEdit({
      argv: [oldPath, '--supersede-with', newPath],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.operation === 'supersede-with') {
      expect(result.oldFrontmatter.extra['superseded-by']).toBe('New.md');
      expect(result.newFrontmatter.extra.supersedes).toBe('Sample.md');
      expect(result.oldFrontmatter.tags).toContain('deprecated');
      expect(result.oldFrontmatter.updated).toBe(TODAY);
      expect(result.newFrontmatter.updated).toBe(TODAY);
    }

    const oldOnDisk = await readFile(oldPath, 'utf8');
    const newOnDisk = await readFile(newPath, 'utf8');
    expect(oldOnDisk).toContain('superseded-by: New.md');
    expect(newOnDisk).toContain('supersedes: Sample.md');
    expect(oldOnDisk).toContain('deprecated');
  });

  it('returns supersede-target-missing when the new path does not exist', async () => {
    const { kbPath, notePath: oldPath } = await makeKbWithNote();
    const missingNew = join(kbPath, 'NoSuch.md');

    const result = await runEdit({
      argv: [oldPath, '--supersede-with', missingNew],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('supersede-target-missing');
      expect(result.details?.missingPath).toBe(missingNew);
    }
    // Old note untouched.
    const onDisk = await readFile(oldPath, 'utf8');
    expect(onDisk).toBe(SAMPLE_NOTE);
  });

  it('rejects self-supersession (same path for old and new) with invalid-args', async () => {
    const { kbPath, notePath } = await makeKbWithNote();

    const result = await runEdit({
      argv: [notePath, '--supersede-with', notePath],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-args');
      expect(result.message).toMatch(/distinct paths/);
    }
    // Original note untouched: no superseded-by or supersedes pointers, no deprecated tag.
    const onDisk = await readFile(notePath, 'utf8');
    expect(onDisk).toBe(SAMPLE_NOTE);
  });

  it('rejects cross-KB supersession with invalid-args', async () => {
    const { kbPath: kbA, notePath: oldPath } = await makeKbWithNote();
    const { kbPath: kbB } = await makeKbWithNote();
    const newPath = join(kbB, 'New.md');
    await writeFile(newPath, SAMPLE_NOTE, 'utf8');

    const result = await runEdit({
      argv: [oldPath, '--supersede-with', newPath],
      stdin: bodyStream(''),
      startDir: kbA,
      now: NOW,
      home: kbA,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-args');
      expect(result.message).toMatch(/same KB/);
    }
    expect(await readFile(oldPath, 'utf8')).toBe(SAMPLE_NOTE);
  });

  it('does not commit either write when validation of the resulting frontmatter fails', async () => {
    const { kbPath, notePath: oldPath } = await makeKbWithNote();
    const newPath = join(kbPath, 'BadType.md');
    // New note has a recordType outside the schema vocabulary; supersede-with validates both before either rename.
    await writeFile(
      newPath,
      '---\ntitle: x\nrecordType: rant\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nbody\n',
      'utf8',
    );

    const result = await runEdit({
      argv: [oldPath, '--supersede-with', newPath],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('schema-validation');
    }
    // Both files untouched.
    const oldAfter = await readFile(oldPath, 'utf8');
    expect(oldAfter).toBe(SAMPLE_NOTE);
  });

  it('canonicalizes the deprecated tag against the KB alias map', async () => {
    const { kbPath, notePath: oldPath } = await makeKbWithNote();
    const newPath = join(kbPath, 'New.md');
    await writeFile(newPath, SAMPLE_NOTE.replace('Sample', 'Replacement'), 'utf8');
    // Declare an alias so `deprecated` canonicalizes to `archived` when added to the old note.
    await writeFile(join(kbPath, '.kb', 'tag-aliases.yaml'), 'aliases:\n  archived: [deprecated]\n', 'utf8');

    const result = await runEdit({
      argv: [oldPath, '--supersede-with', newPath],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.operation === 'supersede-with') {
      expect(result.oldFrontmatter.tags).toContain('archived');
      expect(result.oldFrontmatter.tags).not.toContain('deprecated');
    }
  });

  it('is idempotent on the deprecated tag when it is already present', async () => {
    const kbPath = await mkdtemp(join(tmpdir(), 'kb-edit-cli-dep-'));
    await mkdir(join(kbPath, '.kb'), { recursive: true });
    const oldPath = join(kbPath, 'Old.md');
    const newPath = join(kbPath, 'New.md');
    // Old note already carries the deprecated tag; supersede-with should not duplicate it.
    await writeFile(
      oldPath,
      '---\ntitle: Old\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [legacy, deprecated]\ntype: howto\n---\n\nbody\n',
      'utf8',
    );
    await writeFile(newPath, SAMPLE_NOTE.replace('Sample', 'New'), 'utf8');

    const result = await runEdit({
      argv: [oldPath, '--supersede-with', newPath],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.operation === 'supersede-with') {
      const occurrences = result.oldFrontmatter.tags.filter((t) => t === 'deprecated');
      expect(occurrences).toHaveLength(1);
    }
  });

  it('appends a reference to a single record addressed-by list', async () => {
    const { kbPath, notePath } = await makeKbWithNote();

    const result = await runEdit({
      argv: [notePath, '--add-addressed-by', '[[fix]]'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.operation === 'add-addressed-by') {
      expect(result.results).toHaveLength(1);
      const [record] = result.results;
      expect(record?.ok).toBe(true);
      if (record?.ok) {
        expect(record.frontmatter.extra['addressed-by']).toEqual(['[[fix]]']);
        expect(record.frontmatter.updated).toBe(TODAY);
      }
      const written = await readFile(notePath, 'utf8');
      expect(written).toContain('addressed-by');
      expect(written).toContain('[[fix]]');
    }
  });

  it('appends the same reference to multiple records in one invocation', async () => {
    const { kbPath, notePath } = await makeKbWithNote();
    const second = join(kbPath, 'Second.md');
    await writeFile(second, SAMPLE_NOTE.replace('Sample', 'Second'), 'utf8');

    const result = await runEdit({
      argv: [notePath, second, '--add-addressed-by', '[[fix]]'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.operation === 'add-addressed-by') {
      expect(result.results).toHaveLength(2);
      expect(result.results.every((record) => record.ok)).toBe(true);
      expect(await readFile(notePath, 'utf8')).toContain('[[fix]]');
      expect(await readFile(second, 'utf8')).toContain('[[fix]]');
    }
  });

  it('reports a per-record failure for a missing target while writing the valid ones', async () => {
    const { kbPath, notePath } = await makeKbWithNote();
    const missing = join(kbPath, 'Absent.md');

    const result = await runEdit({
      argv: [notePath, missing, '--add-addressed-by', '[[fix]]'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.operation === 'add-addressed-by') {
      const byPath = new Map(result.results.map((record) => [record.path, record]));
      expect(byPath.get(notePath)?.ok).toBe(true);
      const missingRecord = byPath.get(missing);
      expect(missingRecord?.ok).toBe(false);
      if (missingRecord && !missingRecord.ok) {
        expect(missingRecord.error).toBe('note-not-found');
      }
      // The valid record was still written despite the sibling failure.
      expect(await readFile(notePath, 'utf8')).toContain('[[fix]]');
    }
  });

  it('is idempotent: re-appending an existing reference does not duplicate it', async () => {
    const { kbPath, notePath } = await makeKbWithNote();
    const argv = [notePath, '--add-addressed-by', '[[fix]]'];
    const baseInput = { stdin: bodyStream(''), startDir: kbPath, now: NOW, home: kbPath };

    await runEdit({ argv, ...baseInput, stdin: bodyStream('') });
    const result = await runEdit({ argv, ...baseInput, stdin: bodyStream('') });

    expect(result.ok).toBe(true);
    if (result.ok && result.operation === 'add-addressed-by') {
      const [record] = result.results;
      if (record?.ok) {
        expect(record.frontmatter.extra['addressed-by']).toEqual(['[[fix]]']);
      }
    }
  });

  it('reports a per-record schema-validation failure while writing the valid targets', async () => {
    const { kbPath, notePath } = await makeKbWithNote();
    const badType = join(kbPath, 'BadType.md');
    // A recordType outside the schema vocabulary: appending re-validates the frontmatter, so this record fails.
    await writeFile(
      badType,
      '---\ntitle: x\nrecordType: rant\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nbody\n',
      'utf8',
    );

    const result = await runEdit({
      argv: [notePath, badType, '--add-addressed-by', '[[fix]]'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.operation === 'add-addressed-by') {
      const byPath = new Map(result.results.map((record) => [record.path, record]));
      expect(byPath.get(notePath)?.ok).toBe(true);
      const badRecord = byPath.get(badType);
      expect(badRecord?.ok).toBe(false);
      if (badRecord && !badRecord.ok) {
        expect(badRecord.error).toBe('schema-validation');
      }
      // The valid record was written; the failing one was left untouched.
      expect(await readFile(notePath, 'utf8')).toContain('[[fix]]');
      expect(await readFile(badType, 'utf8')).not.toContain('addressed-by');
    }
  });

  it('reports a per-record no-kb-resolvable failure for a target outside any KB', async () => {
    const { kbPath, notePath } = await makeKbWithNote();
    const orphanDir = await mkdtemp(join(tmpdir(), 'kb-edit-orphan-batch-'));
    const orphan = join(orphanDir, 'orphan.md');
    await writeFile(orphan, SAMPLE_NOTE.replace('Sample', 'Orphan'), 'utf8');

    const result = await runEdit({
      argv: [notePath, orphan, '--add-addressed-by', '[[fix]]'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.operation === 'add-addressed-by') {
      const byPath = new Map(result.results.map((record) => [record.path, record]));
      expect(byPath.get(notePath)?.ok).toBe(true);
      const orphanRecord = byPath.get(orphan);
      expect(orphanRecord?.ok).toBe(false);
      if (orphanRecord && !orphanRecord.ok) {
        expect(orphanRecord.error).toBe('no-kb-resolvable');
      }
    }
  });
});
