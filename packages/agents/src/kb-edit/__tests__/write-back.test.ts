import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { KbAssertion } from '@williamthorsen/kb/records';
import { describe, expect, it } from 'vitest';

import { writeBackNote } from '../write-back.ts';

async function makeTempPath(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return join(dir, 'note.md');
}

/** Builds a baseline assertion record for the write-back under test, with overrides merged in. */
function buildAssertion(overrides: Partial<KbAssertion> = {}): KbAssertion {
  return {
    recordType: 'assertion',
    title: 'Example',
    created: '2026-05-01T08:17:23Z',
    updated: '2026-05-01T08:17:23Z',
    tags: ['example'],
    addressedBy: [],
    extra: {},
    body: '\nBody text.\n',
    ...overrides,
  };
}

describe(writeBackNote, () => {
  it('renders the record to disk on a valid write', async () => {
    const path = await makeTempPath('kb-edit-wb-ok-');

    const result = await writeBackNote({ path, record: buildAssertion({ title: 'New', body: '\nNew body\n' }) });

    expect(result.ok).toBe(true);
    const written = await readFile(path, 'utf8');
    expect(written).toContain('title: New');
    expect(written).toContain('New body');
  });

  it('returns the written content on success', async () => {
    const path = await makeTempPath('kb-edit-wb-content-');

    const result = await writeBackNote({ path, record: buildAssertion() });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const written = await readFile(path, 'utf8');
      expect(result.content).toBe(written);
    }
  });

  it('refuses to write and leaves an existing file untouched when the rendered record fails re-parse', async () => {
    const path = await makeTempPath('kb-edit-wb-bad-');
    const before = '---\ntitle: original\n---\n\nuntouched\n';
    await writeFile(path, before, 'utf8');

    // A record whose `created` is not a valid date renders frontmatter that cannot re-parse as an assertion.
    const result = await writeBackNote({ path, record: buildAssertion({ created: 'not-a-date' }) });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('validation');
      expect(result.errors.join(' ')).toContain('created');
    }
    const after = await readFile(path, 'utf8');
    expect(after).toBe(before);
  });
});
