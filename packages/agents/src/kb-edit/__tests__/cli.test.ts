import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { parseArgs, runEdit } from '../cli.ts';

const NOW = new Date('2026-05-24T14:35:00Z');
const TODAY = '2026-05-24';

const SAMPLE_NOTE = `---
title: Sample
type: howto
created: 2026-05-01
updated: 2026-05-01
tags: [sample]
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

  it('throws when --retag has no value', () => {
    expect(() => parseArgs(['foo.md', '--retag'])).toThrow(/--retag requires a value/);
  });

  it('throws when --retag is followed by another flag instead of a value', () => {
    expect(() => parseArgs(['foo.md', '--retag', '--bump-updated'])).toThrow(/--retag requires a value/);
  });

  it('throws when --supersede-with has no value', () => {
    expect(() => parseArgs(['foo.md', '--supersede-with'])).toThrow(/--supersede-with requires a value/);
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

  it('replaces tags via --retag and surfaces canonicalization audit', async () => {
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
      expect(result.frontmatter.updated).toBe(TODAY);
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
    await mkdir(join(homeDir, '.claude'), { recursive: true });
    await writeFile(
      join(homeDir, '.claude', 'kb.yaml'),
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
    // Stand up a fixture note with a `type` outside the default vocabulary.
    // Bumping `updated:` re-validates the resulting frontmatter, so this surfaces as schema-validation.
    const { kbPath } = await makeKbWithNote();
    const path = join(kbPath, 'bad-type.md');
    await writeFile(
      path,
      '---\ntitle: x\ntype: rant\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nbody\n',
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
      expect(result.details?.findings?.some((f) => f.rule === 'frontmatter.type')).toBe(true);
    }
  });

  it('returns invalid-args for --supersede-with until Task 5 wires it in', async () => {
    const { kbPath, notePath } = await makeKbWithNote();
    const newPath = join(kbPath, 'New.md');
    await writeFile(newPath, SAMPLE_NOTE, 'utf8');

    const result = await runEdit({
      argv: [notePath, '--supersede-with', newPath],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-args');
      expect(result.message).toMatch(/not yet implemented/);
    }
  });
});
