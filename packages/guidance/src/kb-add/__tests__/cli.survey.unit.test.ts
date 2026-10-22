import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { makeBodyStream } from '../../test-utils/make-body-stream.ts';
import { runAdd } from '../cli.ts';
import { makeKb } from '../test-utils/make-kb.ts';
import { NOW } from '../test-utils/now.ts';

const NOTE =
  '---\ntitle: A\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

describe(runAdd, () => {
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
      stdin: makeBodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (!(result.ok && result.mode === 'survey')) {
      return;
    }

    expect(result.kb.path).toBe(kbPath);
    expect(result.taxonomyPath).toBe(join(kbPath, '.kb', 'taxonomy.yaml'));
    expect(result.domains).toEqual([
      { path: 'engineering', description: 'Software engineering practice', provisional: false, noteCount: 0 },
    ]);
    expect(result.undeclaredFolders).toEqual([{ path: 'languages', noteCount: 1 }]);
  });

  it('surveys a store that does not declare a taxonomy', async () => {
    const kbPath = await makeKb();
    await mkdir(join(kbPath, 'content', 'assertions', 'languages'), { recursive: true });
    await writeFile(join(kbPath, 'content', 'assertions', 'languages', 'Types.md'), NOTE, 'utf8');

    const result = await runAdd({
      argv: ['--survey'],
      stdin: makeBodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(true);
    if (!(result.ok && result.mode === 'survey')) {
      return;
    }

    expect(result.domains).toEqual([]);
    expect(result.undeclaredFolders).toEqual([{ path: 'languages', noteCount: 1 }]);
  });

  it('surveys a KB that the registry marks readonly, which refuses only writes', async () => {
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
      stdin: makeBodyStream(''),
      startDir: homeDir,
      now: NOW,
      home: homeDir,
    });

    expect(result.ok).toBe(true);
    if (!(result.ok && result.mode === 'survey')) {
      return;
    }

    expect(result.kb.name).toBe('locked');
    expect(result.kb.path).toBe(kbPath);
  });

  it('returns a survey without consuming stdin', async () => {
    const kbPath = await makeKb();
    // A stream that never emits and never ends: Reading it to EOF would hang, so completing proves it went untouched.
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
      stdin: makeBodyStream(''),
      startDir: kbPath,
      now: NOW,
      home: kbPath,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toBe('invalid-config');
    expect(result.message).toContain('taxonomy.yaml');
  });
});
