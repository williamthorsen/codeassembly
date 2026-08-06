import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { surveyKb } from '../survey.ts';

/** Every path `readFile` was called with, so the survey can be shown to open no note. */
const readFilePaths: string[] = [];

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: (path: Parameters<typeof actual.readFile>[0], options: Parameters<typeof actual.readFile>[1]) => {
      if (typeof path === 'string') {
        readFilePaths.push(path);
      }
      return actual.readFile(path, options);
    },
  };
});

afterEach(() => {
  readFilePaths.length = 0;
});

const NOTE =
  '---\ntitle: A\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

describe(surveyKb, () => {
  it('reports each declared domain with its description, review state, and note count', async () => {
    const kbPath = await makeStore({
      '.kb/taxonomy.yaml': 'domains:\n  engineering: Software engineering practice\nprovisional:\n  languages:\n',
      'content/assertions/engineering/Tooling.md': NOTE,
      'content/assertions/engineering/Testing.md': NOTE,
    });

    const survey = await surveyKb({ kbPath });

    expect(survey.domains).toEqual([
      { path: 'engineering', description: 'Software engineering practice', provisional: false, noteCount: 2 },
      { path: 'languages', description: '', provisional: true, noteCount: 0 },
    ]);
  });

  it('counts a domain as holding every note beneath it, so a grouping domain reads as populated', async () => {
    const kbPath = await makeStore({
      '.kb/taxonomy.yaml': 'domains:\n  engineering: Practice\n  engineering/tooling: Build and test tooling\n',
      'content/assertions/engineering/tooling/Vite.md': NOTE,
      'content/assertions/engineering/tooling/deep/Nested.md': NOTE,
    });

    const survey = await surveyKb({ kbPath });

    expect(survey.domains.map((domain) => [domain.path, domain.noteCount])).toEqual([
      ['engineering', 2],
      ['engineering/tooling', 2],
    ]);
  });

  it('reports a folder holding notes that no domain declares', async () => {
    const kbPath = await makeStore({
      '.kb/taxonomy.yaml': 'domains:\n  engineering: Practice\n',
      'content/assertions/engineering/Tooling.md': NOTE,
      'content/assertions/languages/typescript/Types.md': NOTE,
    });

    const survey = await surveyKb({ kbPath });

    expect(survey.undeclaredFolders).toEqual([{ path: 'languages/typescript', noteCount: 1 }]);
  });

  it('reports a folder nested under a declared domain as undeclared', async () => {
    const kbPath = await makeStore({
      '.kb/taxonomy.yaml': 'domains:\n  engineering: Practice\n',
      'content/assertions/engineering/tooling/Vite.md': NOTE,
    });

    const survey = await surveyKb({ kbPath });

    expect(survey.undeclaredFolders).toEqual([{ path: 'engineering/tooling', noteCount: 1 }]);
  });

  it('reports every folder holding notes and no domains when the store declares no taxonomy', async () => {
    const kbPath = await makeStore({
      'content/assertions/engineering/Tooling.md': NOTE,
      'content/assertions/languages/Types.md': NOTE,
    });

    const survey = await surveyKb({ kbPath });

    expect(survey.domains).toEqual([]);
    expect(survey.undeclaredFolders).toEqual([
      { path: 'engineering', noteCount: 1 },
      { path: 'languages', noteCount: 1 },
    ]);
  });

  it('counts no folder for a note sitting at the assertions root', async () => {
    const kbPath = await makeStore({ 'content/assertions/Loose.md': NOTE });

    const survey = await surveyKb({ kbPath });

    expect(survey.undeclaredFolders).toEqual([]);
  });

  it('sees only the notes the store config admits', async () => {
    const kbPath = await makeStore({
      '.kb/config.yaml': "targets:\n  - 'content/**/*.md'\nexclude:\n  - '**/drafts/**'\n",
      'content/assertions/engineering/Tooling.md': NOTE,
      'content/assertions/drafts/Half-written.md': NOTE,
    });

    const survey = await surveyKb({ kbPath });

    expect(survey.undeclaredFolders).toEqual([{ path: 'engineering', noteCount: 1 }]);
  });

  it('names the taxonomy path even when the file does not exist', async () => {
    const kbPath = await makeStore({ 'content/assertions/engineering/Tooling.md': NOTE });

    const survey = await surveyKb({ kbPath });

    expect(survey.taxonomyPath).toBe(join(kbPath, '.kb', 'taxonomy.yaml'));
  });

  it('opens no note file', async () => {
    const kbPath = await makeStore({
      '.kb/taxonomy.yaml': 'domains:\n  engineering: Practice\n',
      'content/assertions/engineering/Tooling.md': NOTE,
    });
    readFilePaths.length = 0;

    await surveyKb({ kbPath });

    expect(readFilePaths.filter((path) => path.includes('content'))).toEqual([]);
  });
});

// region | Helpers

/** Stands up a temp store with an initialized `.kb/` and the given store-root-relative files; returns its path. */
async function makeStore(files: Record<string, string>): Promise<string> {
  const kbPath = await mkdtemp(join(tmpdir(), 'kb-add-survey-'));
  await mkdir(join(kbPath, '.kb'), { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const full = join(kbPath, relativePath);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return kbPath;
}

// endregion | Helpers
