import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { parseArgs, runAdd } from '../cli.ts';
import type { WriteArgs } from '../types.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');

const NOW = new Date('2026-05-24T14:35:00Z');
const TODAY = '2026-05-24T14:35:00Z';

const NOTE =
  '---\ntitle: A\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

describe(parseArgs, () => {
  it('parses every value-bearing flag in long form', () => {
    const parsed = parseArgs([
      '--kb',
      'coding',
      '--folder',
      'languages/ts',
      '--diataxis',
      'howto',
      '--title',
      'My note',
      '--tags',
      'one, two,three',
      '--domain-description',
      'TypeScript language notes',
    ]);

    expect(parsed).toEqual({
      mode: 'write',
      kb: 'coding',
      folder: 'languages/ts',
      diataxis: 'howto',
      title: 'My note',
      tags: ['one', 'two', 'three'],
      domainDescription: 'TypeScript language notes',
      auto: false,
    });
  });

  it('parses flags with inline = values', () => {
    const parsed = parseWriteArgs(['--diataxis=howto', '--title=Inline', '--tags=a,b']);

    expect(parsed.diataxis).toBe('howto');
    expect(parsed.title).toBe('Inline');
    expect(parsed.tags).toEqual(['a', 'b']);
  });

  it('defaults optional flags to null or an empty list', () => {
    const parsed = parseWriteArgs(['--diataxis', 'concept', '--title', 'Stub']);

    expect(parsed.kb).toBeNull();
    expect(parsed.folder).toBeNull();
    expect(parsed.tags).toEqual([]);
  });

  it('defaults --diataxis to null when omitted', () => {
    const parsed = parseWriteArgs(['--title', 'Stub']);

    expect(parsed.diataxis).toBeNull();
  });

  it('parses --survey as a survey invocation carrying only the KB', () => {
    expect(parseArgs(['--survey', '--kb', 'coding'])).toEqual({ mode: 'survey', kb: 'coding' });
  });

  it('does not require --title under --survey', () => {
    expect(parseArgs(['--survey'])).toEqual({ mode: 'survey', kb: null });
  });

  it('rejects a note-describing flag alongside --survey rather than dropping it', () => {
    expect(() => parseArgs(['--survey', '--title', 'X', '--folder', 'languages'])).toThrow(
      /--survey takes only --kb; drop --folder, --title/,
    );
  });

  it('rejects --auto alongside --survey', () => {
    expect(() => parseArgs(['--survey', '--auto'])).toThrow(/--survey takes only --kb; drop --auto/);
  });

  it('parses --auto and --domain-description as write flags', () => {
    const parsed = parseWriteArgs(['--title', 'Stub', '--auto', '--domain-description', 'Programming languages']);

    expect(parsed.auto).toBe(true);
    expect(parsed.domainDescription).toBe('Programming languages');
  });

  it('defaults --auto to false and --domain-description to null', () => {
    const parsed = parseWriteArgs(['--title', 'Stub']);

    expect(parsed.auto).toBe(false);
    expect(parsed.domainDescription).toBeNull();
  });

  it('throws when --title is missing', () => {
    expect(() => parseArgs(['--diataxis', 'howto'])).toThrow(/--title is required/);
  });

  it('throws when a value-bearing flag has no value', () => {
    expect(() => parseArgs(['--diataxis'])).toThrow(/--diataxis requires a value/);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['--diataxis', 'howto', '--title', 'X', '--bogus'])).toThrow(/unknown flag/);
  });

  it('rejects the retired --type flag as unknown', () => {
    expect(() => parseArgs(['--type', 'howto', '--title', 'X'])).toThrow(/unknown flag/);
  });

  it('rejects the retired --last-verified flag as unknown', () => {
    expect(() => parseArgs(['--last-verified', '2026-01-15', '--title', 'X'])).toThrow(/unknown flag/);
  });
});

describe(runAdd, () => {
  it('writes a note to a discovered KB and reports the path and record', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--diataxis', 'howto', '--title', 'Working with streams', '--tags', 'node,streams'],
      stdin: bodyStream('How to work with Node streams.\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.mode === 'write') {
      expect(result.path).toBe(join(kbPath, 'content', 'assertions', 'Working with streams.md'));
      expect(result.kb.source).toBe('discovered');
      expect(result.record.title).toBe('Working with streams');
      expect(result.record.created).toBe(TODAY);
      expect(result.record.updated).toBe(TODAY);
      expect(result.record.lastVerified).toBe(TODAY);
      const content = await readFile(result.path, 'utf8');
      expect(content).toContain('title: Working with streams');
      expect(content).toContain('How to work with Node streams.');
    }
  });

  it('places the note under content/assertions plus the given topic folder, creating it on demand', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--diataxis', 'concept', '--title', 'IO', '--folder', 'languages/typescript'],
      stdin: bodyStream('A short note.\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.mode === 'write') {
      expect(result.path).toBe(join(kbPath, 'content', 'assertions', 'languages', 'typescript', 'IO.md'));
    }
  });

  it('accepts an empty body on stdin', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--diataxis', 'reference', '--title', 'Stub'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.mode === 'write') {
      const content = await readFile(result.path, 'utf8');
      expect(content).toMatch(/^---\nrecordType: assertion\ntitle: Stub\n/);
    }
  });

  it('returns missing-destination when no .kb/ and no --kb are available', async () => {
    const result = await runAdd({
      argv: ['--diataxis', 'howto', '--title', 'Floating'],
      stdin: bodyStream(''),
      startDir: '/',
      now: NOW,
      home: '/nonexistent-home',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('missing-destination');
      expect(result.message).toContain('--kb');
    }
  });

  it('names the registered KBs and points to --kb @default in the missing-destination message', async () => {
    const kbPath = await makeKb();
    const homeDir = await mkdtemp(join(tmpdir(), 'kb-add-missing-'));
    await mkdir(join(homeDir, '.agents'), { recursive: true });
    await writeFile(
      join(homeDir, '.agents', 'kb.yaml'),
      `default_kb: primary\nkbs:\n  primary:\n    path: ${kbPath}\n`,
      'utf8',
    );

    const result = await runAdd({
      argv: ['--diataxis', 'howto', '--title', 'Floating'],
      stdin: bodyStream(''),
      // startDir avoids the KB so discovery does not supply a destination.
      startDir: homeDir,
      now: NOW,
      home: homeDir,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('missing-destination');
      expect(result.message).toContain('primary');
      expect(result.message).toContain('--kb @default');
    }
  });

  it('returns no-default when --kb @default is given but no default_kb is configured', async () => {
    const kbPath = await makeKb();
    const homeDir = await mkdtemp(join(tmpdir(), 'kb-add-no-default-'));
    await mkdir(join(homeDir, '.agents'), { recursive: true });
    await writeFile(join(homeDir, '.agents', 'kb.yaml'), `kbs:\n  primary:\n    path: ${kbPath}\n`, 'utf8');

    const result = await runAdd({
      argv: ['--kb', '@default', '--diataxis', 'howto', '--title', 'Floating'],
      stdin: bodyStream(''),
      startDir: homeDir,
      now: NOW,
      home: homeDir,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('no-default');
      expect(result.message).toContain('@default');
    }
  });

  it('returns no-kb-resolvable with requestedKb when --kb names an unknown entry', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--kb', 'nonexistent', '--diataxis', 'howto', '--title', 'X'],
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

  it('writes recordType: assertion and the Diátaxis --diataxis label into extra', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--diataxis', 'howto', '--title', 'Labeled'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.mode === 'write') {
      expect(result.record.recordType).toBe('assertion');
      expect(result.record.extra.diataxis).toBe('howto');
      const written = await readFile(result.path, 'utf8');
      expect(written).toMatch(/^recordType: assertion$/m);
      expect(written).toContain('diataxis: howto');
    }
  });

  it('writes a note even when --diataxis is omitted', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--title', 'Unlabeled'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.mode === 'write') {
      expect(result.record.recordType).toBe('assertion');
      expect(result.record.extra).not.toHaveProperty('diataxis');
    }
  });

  it('returns collision and does not overwrite an existing note', async () => {
    const kbPath = await makeKb();
    const existing = join(kbPath, 'content', 'assertions', 'Existing.md');
    await mkdir(dirname(existing), { recursive: true });
    await writeFile(existing, 'pre-existing\n', 'utf8');

    const result = await runAdd({
      argv: ['--diataxis', 'howto', '--title', 'Existing'],
      stdin: bodyStream('new body\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('collision');
      expect(result.details?.existingPath).toBe(existing);
    }
    expect(await readFile(existing, 'utf8')).toBe('pre-existing\n');
  });

  it('returns readonly-kb when the explicit --kb names a readonly registry entry', async () => {
    // Stand up an isolated HOME with a `.agents/kb.yaml` declaring the only writable target as readonly.
    // runAdd resolves through resolveWritableKb, so the refusal surfaces as a top-level readonly-kb error
    // without ever touching disk inside the KB.
    const kbPath = await makeKb();
    const homeDir = await mkdtemp(join(tmpdir(), 'kb-add-readonly-'));
    await mkdir(join(homeDir, '.agents'), { recursive: true });
    await writeFile(
      join(homeDir, '.agents', 'kb.yaml'),
      `kbs:\n  locked:\n    path: ${kbPath}\n    readonly: true\n`,
      'utf8',
    );

    const result = await runAdd({
      argv: ['--kb', 'locked', '--diataxis', 'howto', '--title', 'Refused'],
      stdin: bodyStream(''),
      // startDir avoids the KB so discovery does not produce a writable fallback.
      startDir: homeDir,
      now: NOW,
      home: homeDir,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('readonly-kb');
      expect(result.details?.readonlyKbName).toBe('locked');
      expect(result.details?.readonlyKbPath).toBe(kbPath);
    }
    // No note should have landed in the readonly KB.
    const entries = await readdir(kbPath);
    expect(entries.filter((name) => name !== '.kb')).toEqual([]);
  });

  it('returns invalid-args when --title is missing', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--diataxis', 'howto'],
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
      argv: ['--diataxis', 'howto', '--title', 'foo/bar'],
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

  it('returns invalid-args when --folder re-names the assertions archetype segment', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--diataxis', 'howto', '--title', 'Doubled', '--folder', 'assertions/tools'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-args');
      expect(result.message).toContain('assertions/');
    }
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
        argv: ['--diataxis', 'howto', '--title', 'Aliases fallback', '--tags', 'node.js,react'],
        stdin: bodyStream('Body.\n'),
        startDir: kbPath,
        now: NOW,
        home: kbPath,
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.mode === 'write') {
        // Empty-map fallback fired: canonicalTags equals originalTags (no rewriting happened).
        expect(result.originalTags).toEqual(['node.js', 'react']);
        expect(result.canonicalTags).toEqual(['node.js', 'react']);
        expect(result.record.tags).toEqual(['node.js', 'react']);
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

  it('declares the note folder from --domain-description and reports the placement', async () => {
    const kbPath = await makeKb();
    await writeFile(join(kbPath, '.kb', 'taxonomy.yaml'), 'domains:\n', 'utf8');

    const result = await runAdd({
      argv: ['--title', 'Types', '--folder', 'languages/typescript', '--domain-description', 'The TypeScript language'],
      stdin: bodyStream('Body.\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.mode === 'write') {
      expect(result.placement).toEqual({
        domain: 'languages/typescript',
        added: [
          { path: 'languages', provisional: true },
          { path: 'languages/typescript', provisional: false },
        ],
      });
    }
    const taxonomy = await readFile(join(kbPath, '.kb', 'taxonomy.yaml'), 'utf8');
    expect(taxonomy).toContain('languages/typescript: The TypeScript language');
  });

  it('routes the declared domain to provisional under --auto', async () => {
    const kbPath = await makeKb();
    await writeFile(join(kbPath, '.kb', 'taxonomy.yaml'), 'domains:\n', 'utf8');

    const result = await runAdd({
      argv: ['--title', 'Types', '--folder', 'languages', '--domain-description', 'Languages', '--auto'],
      stdin: bodyStream('Body.\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    const taxonomy = await readFile(join(kbPath, '.kb', 'taxonomy.yaml'), 'utf8');
    expect(taxonomy).toContain('provisional:\n  languages: Languages\n');
  });

  it('writes without a taxonomy and reports no placement when the store has not adopted one', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--title', 'Types', '--folder', 'languages'],
      stdin: bodyStream('Body.\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.mode === 'write') {
      expect(result.placement).toBeUndefined();
    }
    expect(await readdir(join(kbPath, '.kb'))).toEqual([]);
  });

  it('surveys a store, reporting its KB, taxonomy path, declared domains, and undeclared folders', async () => {
    const kbPath = await makeKb();
    await writeFile(
      join(kbPath, '.kb', 'taxonomy.yaml'),
      'domains:\n  engineering: Software engineering practice\n',
      'utf8',
    );
    await mkdir(join(kbPath, 'content', 'assertions', 'languages'), { recursive: true });
    await writeFile(join(kbPath, 'content', 'assertions', 'languages', 'Types.md'), NOTE, 'utf8');

    const result = await runAdd({
      argv: ['--survey'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.mode === 'survey') {
      expect(result.kb.path).toBe(kbPath);
      expect(result.taxonomyPath).toBe(join(kbPath, '.kb', 'taxonomy.yaml'));
      expect(result.domains).toEqual([
        { path: 'engineering', description: 'Software engineering practice', provisional: false, noteCount: 0 },
      ]);
      expect(result.undeclaredFolders).toEqual([{ path: 'languages', noteCount: 1 }]);
    }
  });

  it('surveys a store that declares no taxonomy', async () => {
    const kbPath = await makeKb();
    await mkdir(join(kbPath, 'content', 'assertions', 'languages'), { recursive: true });
    await writeFile(join(kbPath, 'content', 'assertions', 'languages', 'Types.md'), NOTE, 'utf8');

    const result = await runAdd({
      argv: ['--survey'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.mode === 'survey') {
      expect(result.domains).toEqual([]);
      expect(result.undeclaredFolders).toEqual([{ path: 'languages', noteCount: 1 }]);
    }
  });

  it('surveys a KB the registry marks readonly, which refuses only writes', async () => {
    const kbPath = await makeKb();
    const homeDir = await mkdtemp(join(tmpdir(), 'kb-add-survey-readonly-'));
    await mkdir(join(homeDir, '.agents'), { recursive: true });
    await writeFile(
      join(homeDir, '.agents', 'kb.yaml'),
      `kbs:\n  locked:\n    path: ${kbPath}\n    readonly: true\n`,
      'utf8',
    );

    const result = await runAdd({
      argv: ['--survey', '--kb', 'locked'],
      stdin: bodyStream(''),
      startDir: homeDir,
      now: NOW,
      home: homeDir,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.mode === 'survey') {
      expect(result.kb.name).toBe('locked');
      expect(result.kb.path).toBe(kbPath);
    }
  });

  it('returns a survey without consuming stdin', async () => {
    const kbPath = await makeKb();
    // A stream that never emits and never ends: reading it to EOF would hang, so completing proves it went untouched.
    const unendingStdin = new Readable({ read() {} });

    const result = await runAdd({
      argv: ['--survey'],
      stdin: unendingStdin,
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    expect(unendingStdin.readableDidRead).toBe(false);
  });

  it('returns invalid-config when the store taxonomy is malformed', async () => {
    const kbPath = await makeKb();
    await writeFile(join(kbPath, '.kb', 'taxonomy.yaml'), 'domains:\n  - not-a-mapping\n', 'utf8');

    const result = await runAdd({
      argv: ['--survey'],
      stdin: bodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-config');
      expect(result.message).toContain('taxonomy.yaml');
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
      args: [bundlePath, '--diataxis', 'howto', '--title', 'Subprocess test'],
      stdinBody: 'Body from stdin.\n',
      cwd: kbPath,
      env: { ...process.env, HOME: kbPath },
    });

    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(stdout);
    expect(parsed).toMatchObject({ ok: true });
    const writtenPath = join(kbPath, 'content', 'assertions', 'Subprocess test.md');
    const content = await readFile(writtenPath, 'utf8');
    expect(content).toContain('title: Subprocess test');
    expect(content).toContain('Body from stdin.');
  });
});

// region | Helpers

/** Builds a Readable stream that emits the given body and ends. */
function bodyStream(body: string): Readable {
  return Readable.from([Buffer.from(body, 'utf8')]);
}

/** Builds a temp KB rooted at a fresh directory with a `.kb/` marker. */
async function makeKb(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kb-add-cli-'));
  await mkdir(join(root, '.kb'), { recursive: true });
  return root;
}

/** Parses argv expected to describe a write, failing the test rather than the type checker when it describes a survey. */
function parseWriteArgs(argv: readonly string[]): WriteArgs {
  const parsed = parseArgs(argv);
  if (parsed.mode !== 'write') {
    throw new Error(`expected a write invocation; got mode "${parsed.mode}"`);
  }
  return parsed;
}

/** Runs a child process with a string body piped to stdin; resolves with its stdout and exit code. */
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
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
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

// endregion | Helpers
