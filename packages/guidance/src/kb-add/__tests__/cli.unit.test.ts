import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { makeBodyStream } from '../../test-utils/make-body-stream.ts';
import { parseArgs, runAdd } from '../cli.ts';
import { makeKb } from '../test-utils/make-kb.ts';
import { NOW } from '../test-utils/now.ts';
import type { WriteArgs } from '../types.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');

const TODAY = '2026-05-24T14:35:00Z';

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

  it('parses --survey as a survey invocation containing only the KB', () => {
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

  it('throws when a value-bearing flag is given without a value', () => {
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
      stdin: makeBodyStream('How to work with Node streams.\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== 'write') return;

    expect(result.path).toBe(join(kbPath, 'content', 'assertions', 'Working with streams.md'));
    expect(result.kb.source).toBe('discovered');
    expect(result.record.title).toBe('Working with streams');
    expect(result.record.created).toBe(TODAY);
    expect(result.record.updated).toBe(TODAY);
    expect(result.record.lastVerified).toBe(TODAY);
    const content = await readFile(result.path, 'utf8');
    expect(content).toContain('title: Working with streams');
    expect(content).toContain('How to work with Node streams.');
  });

  it('places the note under content/assertions plus the given topic folder, creating it on demand', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--diataxis', 'concept', '--title', 'IO', '--folder', 'languages/typescript'],
      stdin: makeBodyStream('A short note.\n'),
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
      stdin: makeBodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== 'write') return;

    const content = await readFile(result.path, 'utf8');
    expect(content).toMatch(/^---\nrecordType: assertion\ntitle: Stub\n/);
  });

  it('returns missing-destination when discovery does not find a .kb/ and --kb is not given', async () => {
    const result = await runAdd({
      argv: ['--diataxis', 'howto', '--title', 'Floating'],
      stdin: makeBodyStream(''),
      startDir: '/',
      now: NOW,
      home: '/nonexistent-home',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toBe('missing-destination');
    expect(result.message).toContain('--kb');
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
      stdin: makeBodyStream(''),
      // startDir avoids the KB so that discovery does not supply a destination.
      startDir: homeDir,
      now: NOW,
      home: homeDir,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toBe('missing-destination');
    expect(result.message).toContain('primary');
    expect(result.message).toContain('--kb @default');
  });

  it('returns no-default when --kb @default is given but the registry does not configure a default_kb', async () => {
    const kbPath = await makeKb();
    const homeDir = await mkdtemp(join(tmpdir(), 'kb-add-no-default-'));
    await mkdir(join(homeDir, '.agents'), { recursive: true });
    await writeFile(join(homeDir, '.agents', 'kb.yaml'), `kbs:\n  primary:\n    path: ${kbPath}\n`, 'utf8');

    const result = await runAdd({
      argv: ['--kb', '@default', '--diataxis', 'howto', '--title', 'Floating'],
      stdin: makeBodyStream(''),
      startDir: homeDir,
      now: NOW,
      home: homeDir,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toBe('no-default');
    expect(result.message).toContain('@default');
  });

  it('returns no-kb-resolvable with requestedKb when --kb names an unknown entry', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--kb', 'nonexistent', '--diataxis', 'howto', '--title', 'X'],
      stdin: makeBodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toBe('no-kb-resolvable');
    expect(result.details?.requestedKb).toBe('nonexistent');
  });

  it('writes recordType: assertion and the Diátaxis --diataxis label into extra', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--diataxis', 'howto', '--title', 'Labeled'],
      stdin: makeBodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== 'write') return;

    expect(result.record.recordType).toBe('assertion');
    expect(result.record.extra['diataxis']).toBe('howto');
    const written = await readFile(result.path, 'utf8');
    expect(written).toMatch(/^recordType: assertion$/m);
    expect(written).toContain('diataxis: howto');
  });

  it('writes a note even when --diataxis is omitted', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--title', 'Unlabeled'],
      stdin: makeBodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (!(result.ok && result.mode === 'write')) {
      return;
    }

    expect(result.record.recordType).toBe('assertion');
    expect(result.record.extra).not.toHaveProperty('diataxis');
  });

  it('returns collision and does not overwrite an existing note', async () => {
    const kbPath = await makeKb();
    const existing = join(kbPath, 'content', 'assertions', 'Existing.md');
    await mkdir(dirname(existing), { recursive: true });
    await writeFile(existing, 'pre-existing\n', 'utf8');

    const result = await runAdd({
      argv: ['--diataxis', 'howto', '--title', 'Existing'],
      stdin: makeBodyStream('new body\n'),
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
    // Isolate HOME, so that the registry's only writable target is the readonly entry.
    // runAdd resolves through resolveWritableKb, so it reports the refusal as a top-level readonly-kb error
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
      stdin: makeBodyStream(''),
      // startDir avoids the KB so that discovery does not produce a writable fallback.
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
    const entries = await readdir(kbPath);
    expect(entries.filter((name) => name !== '.kb')).toEqual([]);
  });

  it('returns invalid-args when --title is missing', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--diataxis', 'howto'],
      stdin: makeBodyStream(''),
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
      stdin: makeBodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-title');
    }
    const entries = await readdir(kbPath);
    expect(entries.filter((name) => name !== '.kb')).toEqual([]);
  });

  it('returns invalid-args when --folder re-names the assertions archetype segment', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--diataxis', 'howto', '--title', 'Doubled', '--folder', 'assertions/tools'],
      stdin: makeBodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toBe('invalid-args');
    expect(result.message).toContain('assertions/');
  });

  it('warns on stderr and falls back to an empty alias map when tag-aliases.yaml is malformed', async () => {
    // Copy the malformed fixture into a fresh KB, so that the write stays in an isolated tempdir while the
    // alias-load arm hits a real parse failure.
    const kbPath = await makeKb();
    await copyFile(
      join(FIXTURES, 'aliases.malformed', '.kb', 'tag-aliases.yaml'),
      join(kbPath, '.kb', 'tag-aliases.yaml'),
    );

    using stdio = captureStdio();
    const result = await runAdd({
      argv: ['--diataxis', 'howto', '--title', 'Aliases fallback', '--tags', 'node.js,react'],
      stdin: makeBodyStream('Body.\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.mode === 'write') {
      expect(result.originalTags).toEqual(['node.js', 'react']);
      expect(result.canonicalTags).toEqual(['node.js', 'react']);
      expect(result.record.tags).toEqual(['node.js', 'react']);
    }

    expect(stdio.stderrChunks).toContainEqual(expect.stringMatching(/^kb-add: warning: could not load tag aliases: /));
  });

  it('declares the note folder from --domain-description and reports the placement', async () => {
    const kbPath = await makeKb();
    await writeFile(join(kbPath, '.kb', 'taxonomy.yaml'), 'domains:\n', 'utf8');

    const result = await runAdd({
      argv: ['--title', 'Types', '--folder', 'languages/typescript', '--domain-description', 'The TypeScript language'],
      stdin: makeBodyStream('Body.\n'),
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

  it('declares the domain as provisional under --auto', async () => {
    const kbPath = await makeKb();
    await writeFile(join(kbPath, '.kb', 'taxonomy.yaml'), 'domains:\n', 'utf8');

    const result = await runAdd({
      argv: ['--title', 'Types', '--folder', 'languages', '--domain-description', 'Languages', '--auto'],
      stdin: makeBodyStream('Body.\n'),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    const taxonomy = await readFile(join(kbPath, '.kb', 'taxonomy.yaml'), 'utf8');
    expect(taxonomy).toContain('provisional:\n  languages: Languages\n');
  });

  it('writes without a taxonomy and does not report a placement when the store has not adopted one', async () => {
    const kbPath = await makeKb();

    const result = await runAdd({
      argv: ['--title', 'Types', '--folder', 'languages'],
      stdin: makeBodyStream('Body.\n'),
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
});

// region | Helpers

/** Parses argv expected to describe a write, failing the test rather than the type checker when it describes a survey. */
function parseWriteArgs(argv: readonly string[]): WriteArgs {
  const parsed = parseArgs(argv);
  if (parsed.mode !== 'write') {
    throw new Error(`expected a write invocation; got mode "${parsed.mode}"`);
  }
  return parsed;
}

// endregion | Helpers
