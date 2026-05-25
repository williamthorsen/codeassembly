import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { parseArgs, runAdd } from '../cli.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');

/** Run a child process with a string body piped to stdin; resolve with its stdout and exit code. */
async function runChild(input: {
  command: string;
  args: readonly string[];
  stdinBody: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, { cwd: input.cwd, env: input.env });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        exitCode: code ?? 0,
      }),
    );
    child.stdin.write(input.stdinBody);
    child.stdin.end();
  });
}

const NOW = new Date('2026-05-24T14:35:00Z');
const TODAY = '2026-05-24';

/** Build a Readable stream that emits the given body and ends. */
function bodyStream(body: string): Readable {
  return Readable.from([Buffer.from(body, 'utf8')]);
}

/** Build a temp KB rooted at a fresh directory with a `.kb/` marker. */
async function makeKb(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kb-add-cli-'));
  await mkdir(join(root, '.kb'), { recursive: true });
  return root;
}

describe(parseArgs, () => {
  it('parses every value-bearing flag in long form', () => {
    const parsed = parseArgs([
      '--kb',
      'coding',
      '--folder',
      'languages/ts',
      '--type',
      'howto',
      '--title',
      'My note',
      '--tags',
      'one, two,three',
      '--last-verified',
      '2026-01-15',
    ]);

    expect(parsed).toEqual({
      kb: 'coding',
      folder: 'languages/ts',
      type: 'howto',
      title: 'My note',
      tags: ['one', 'two', 'three'],
      lastVerified: '2026-01-15',
    });
  });

  it('parses flags with inline = values', () => {
    const parsed = parseArgs(['--type=howto', '--title=Inline', '--tags=a,b']);

    expect(parsed.type).toBe('howto');
    expect(parsed.title).toBe('Inline');
    expect(parsed.tags).toEqual(['a', 'b']);
  });

  it('defaults optional flags to null or an empty list', () => {
    const parsed = parseArgs(['--type', 'concept', '--title', 'Stub']);

    expect(parsed.kb).toBeNull();
    expect(parsed.folder).toBeNull();
    expect(parsed.tags).toEqual([]);
    expect(parsed.lastVerified).toBeNull();
  });

  it('throws when --title is missing', () => {
    expect(() => parseArgs(['--type', 'howto'])).toThrow(/--title is required/);
  });

  it('throws when --type is missing', () => {
    expect(() => parseArgs(['--title', 'X'])).toThrow(/--type is required/);
  });

  it('throws when a value-bearing flag has no value', () => {
    expect(() => parseArgs(['--type'])).toThrow(/--type requires a value/);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['--type', 'howto', '--title', 'X', '--bogus'])).toThrow(/unknown flag/);
  });
});

describe(runAdd, () => {
  it('writes a note to a discovered KB and reports the path and frontmatter', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--type', 'howto', '--title', 'Working with streams', '--tags', 'node,streams'],
      stdin: bodyStream('How to work with Node streams.\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toBe(join(kbPath, 'Working with streams.md'));
      expect(result.kb.source).toBe('discovered');
      expect(result.frontmatter.title).toBe('Working with streams');
      expect(result.frontmatter.created).toBe(TODAY);
      const content = await readFile(result.path, 'utf8');
      expect(content).toContain('title: Working with streams');
      expect(content).toContain('How to work with Node streams.');
    }
  });

  it('places the note under the given folder, creating it on demand', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--type', 'concept', '--title', 'IO', '--folder', 'languages/typescript'],
      stdin: bodyStream('A short note.\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toBe(join(kbPath, 'languages', 'typescript', 'IO.md'));
    }
  });

  it('accepts an empty body on stdin', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--type', 'reference', '--title', 'Stub'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const content = await readFile(result.path, 'utf8');
      expect(content).toMatch(/^---\ntitle: Stub\n/);
    }
  });

  it('returns no-kb-resolvable when no .kb/ and no registry default exist', async () => {
    const result = await runAdd({
      argv: ['--type', 'howto', '--title', 'Floating'],
      stdin: bodyStream(''),
      startDir: '/',
      now: NOW,
      home: '/nonexistent-home',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('no-kb-resolvable');
    }
  });

  it('returns no-kb-resolvable with requestedKb when --kb names an unknown entry', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--kb', 'nonexistent', '--type', 'howto', '--title', 'X'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('no-kb-resolvable');
      expect(result.details?.requestedKb).toBe('nonexistent');
    }
  });

  it('returns schema-validation when the type is not in the schema vocabulary', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--type', 'rant', '--title', 'X'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('schema-validation');
      expect(result.details?.findings?.some((finding) => finding.rule === 'frontmatter.type')).toBe(true);
    }
  });

  it('returns collision and does not overwrite an existing note', async () => {
    const kbPath = await makeKb();
    await writeFile(join(kbPath, 'Existing.md'), 'pre-existing\n', 'utf8');

    const result = await runAdd({
      argv: ['--type', 'howto', '--title', 'Existing'],
      stdin: bodyStream('new body\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('collision');
      expect(result.details?.existingPath).toBe(join(kbPath, 'Existing.md'));
    }
    const content = await readFile(join(kbPath, 'Existing.md'), 'utf8');
    expect(content).toBe('pre-existing\n');
  });

  it('returns invalid-args when --title is missing', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--type', 'howto'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-args');
    }
  });

  it('returns invalid-title when title contains a path separator', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--type', 'howto', '--title', 'foo/bar'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-title');
    }
    // Confirm no file landed at the KB root either.
    const entries = await readdir(kbPath);
    expect(entries.filter((name) => name !== '.kb')).toEqual([]);
  });

  it('warns on stderr and falls back to an empty alias map when tag-aliases.yaml is malformed', async () => {
    // Stand up a fresh KB and copy in the intentionally malformed tag-aliases.yaml fixture, so the write
    // itself stays in an isolated tempdir while the alias-load arm hits a real parse failure.
    const kbPath = await makeKb();
    await copyFile(
      join(FIXTURES, 'malformed-aliases', '.kb', 'tag-aliases.yaml'),
      join(kbPath, '.kb', 'tag-aliases.yaml'),
    );

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const result = await runAdd({
        // `nodejs` would canonicalize to `node` if the aliases loaded; with the empty-map fallback it stays as-is.
        argv: ['--type', 'howto', '--title', 'Aliases fallback', '--tags', 'node.js,react'],
        stdin: bodyStream('Body.\n'),
        startDir: kbPath,
        now: NOW,
        home: kbPath,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Empty-map fallback fired: canonicalTags equals originalTags (no rewriting happened).
        expect(result.originalTags).toEqual(['node.js', 'react']);
        expect(result.canonicalTags).toEqual(['node.js', 'react']);
        expect(result.frontmatter.tags).toEqual(['node.js', 'react']);
      }

      const stderrCalls = stderrSpy.mock.calls
        .map((call) => call[0])
        .filter((arg): arg is string => typeof arg === 'string');
      const warningLine = stderrCalls.find((line) => line.includes('could not load tag aliases'));
      expect(warningLine).toBeDefined();
      expect(warningLine).toMatch(/^kb-add: warning: could not load tag aliases: /);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('subprocess smoke: piping a body into the built bundle produces a written note and well-shaped JSON', async () => {
    // The bundled `.mjs` is produced by the build step; we run it directly via node to verify wire shape.
    const kbPath = await makeKb();
    const bundlePath = join(import.meta.dirname, '..', '..', '..', 'content', 'skills', 'kb-add', 'kb-add.mjs');

    // The bundle may not exist in a watch-mode run; skip cleanly in that case.
    try {
      await stat(bundlePath);
    } catch {
      return;
    }

    const { stdout, exitCode } = await runChild({
      command: process.execPath,
      args: [bundlePath, '--type', 'howto', '--title', 'Subprocess test'],
      stdinBody: 'Body from stdin.\n',
      cwd: kbPath,
      env: { ...process.env, HOME: kbPath },
    });

    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(stdout);
    expect(parsed).toMatchObject({ ok: true });
    const writtenPath = join(kbPath, 'Subprocess test.md');
    const content = await readFile(writtenPath, 'utf8');
    expect(content).toContain('title: Subprocess test');
    expect(content).toContain('Body from stdin.');
  });
});
