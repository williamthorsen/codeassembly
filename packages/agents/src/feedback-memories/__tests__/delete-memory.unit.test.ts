import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { deleteMemories } from '../delete-memory.ts';

const INDEX_TWO = `# Memory

## Feedback

- [A](feedback-a.md): a
- [B](feedback-b.md): b
`;

/** Creates a temp store memory directory and returns its absolute path. */
async function makeMemoryDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'migrate-del-'));
  const memory = join(dir, 'memory');
  await mkdir(memory, { recursive: true });
  return memory;
}

/** True when a path exists on disk. */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe(deleteMemories, () => {
  it('deletes the file and removes its MEMORY.md line', async () => {
    const memory = await makeMemoryDir();
    await writeFile(join(memory, 'feedback-a.md'), 'body a', 'utf8');
    await writeFile(join(memory, 'feedback-b.md'), 'body b', 'utf8');
    await writeFile(join(memory, 'MEMORY.md'), INDEX_TWO, 'utf8');

    const result = await deleteMemories({ paths: [join(memory, 'feedback-a.md')] });

    expect(result.results[0]).toMatchObject({ deleted: true, indexUpdated: true });
    expect(await exists(join(memory, 'feedback-a.md'))).toBe(false);
    const index = await readFile(join(memory, 'MEMORY.md'), 'utf8');
    expect(index).not.toContain('](feedback-a.md)');
    expect(index).toContain('](feedback-b.md)');
  });

  it('reconciles each store index once for a cross-store batch', async () => {
    const storeA = await makeMemoryDir();
    const storeB = await makeMemoryDir();
    await writeFile(join(storeA, 'feedback-a.md'), 'a', 'utf8');
    await writeFile(join(storeA, 'MEMORY.md'), '# Memory\n\n## Feedback\n\n- [A](feedback-a.md): a\n', 'utf8');
    await writeFile(join(storeB, 'feedback-c.md'), 'c', 'utf8');
    await writeFile(join(storeB, 'MEMORY.md'), '# Memory\n\n## Feedback\n\n- [C](feedback-c.md): c\n', 'utf8');

    const result = await deleteMemories({
      paths: [join(storeA, 'feedback-a.md'), join(storeB, 'feedback-c.md')],
    });

    expect(result.results.every((outcome) => outcome.deleted && outcome.indexUpdated)).toBe(true);
    expect(await readFile(join(storeA, 'MEMORY.md'), 'utf8')).not.toContain('](feedback-a.md)');
    expect(await readFile(join(storeB, 'MEMORY.md'), 'utf8')).not.toContain('](feedback-c.md)');
  });

  it('reports an already-absent file without failing the batch', async () => {
    const memory = await makeMemoryDir();
    await writeFile(join(memory, 'MEMORY.md'), '# Memory\n', 'utf8');

    const result = await deleteMemories({ paths: [join(memory, 'gone.md')] });

    expect(result.ok).toBe(true);
    expect(result.results[0]).toMatchObject({ deleted: false, indexUpdated: false });
    expect(result.results[0]?.note).toContain('already absent');
  });

  it('deletes an orphan memory that has no MEMORY.md line', async () => {
    const memory = await makeMemoryDir();
    await writeFile(join(memory, 'feedback-orphan.md'), 'orphan', 'utf8');
    await writeFile(
      join(memory, 'MEMORY.md'),
      '# Memory\n\n## Feedback\n\n- [Other](feedback-other.md): other\n',
      'utf8',
    );

    const result = await deleteMemories({ paths: [join(memory, 'feedback-orphan.md')] });

    expect(result.results[0]).toMatchObject({ deleted: true, indexUpdated: false });
    expect(result.results[0]?.note).toContain('no MEMORY.md line matched');
    expect(await exists(join(memory, 'feedback-orphan.md'))).toBe(false);
  });

  it('deletes the file even when the store has no MEMORY.md', async () => {
    const memory = await makeMemoryDir();
    await writeFile(join(memory, 'feedback-a.md'), 'a', 'utf8');

    const result = await deleteMemories({ paths: [join(memory, 'feedback-a.md')] });

    expect(result.results[0]).toMatchObject({ deleted: true, indexUpdated: false });
    expect(await exists(join(memory, 'feedback-a.md'))).toBe(false);
  });
});
