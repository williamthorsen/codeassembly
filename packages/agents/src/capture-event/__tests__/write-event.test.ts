import { mkdtemp, readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeEvent } from '../write-event.ts';

const ID = '01HZZZZZZZZZZZZZZZZZZZZZZZZ';
const CONTENT = '---\nrecordType: event\nid: 01HZ\n---\n\nBody.\n';

describe(writeEvent, () => {
  it('writes the record to content/events/{id}.md under the store root', async () => {
    const storePath = await mkdtemp(join(tmpdir(), 'capture-write-'));

    const path = await writeEvent({ storePath, id: ID, content: CONTENT });

    expect(path).toBe(join(storePath, 'content', 'events', `${ID}.md`));
    expect(await readFile(path, 'utf8')).toBe(CONTENT);
  });

  it('creates the content/events directory when it does not exist', async () => {
    const storePath = await mkdtemp(join(tmpdir(), 'capture-write-'));

    await writeEvent({ storePath, id: ID, content: CONTENT });

    const dirStat = await stat(join(storePath, 'content', 'events'));
    expect(dirStat.isDirectory()).toBe(true);
  });

  it('refuses to overwrite an existing record with the same id', async () => {
    const storePath = await mkdtemp(join(tmpdir(), 'capture-write-'));

    await writeEvent({ storePath, id: ID, content: CONTENT });

    await expect(writeEvent({ storePath, id: ID, content: 'overwrite attempt' })).rejects.toThrow();
    expect(await readFile(join(storePath, 'content', 'events', `${ID}.md`), 'utf8')).toBe(CONTENT);
  });

  it('leaves no temp files in the content/events directory after a successful write', async () => {
    const storePath = await mkdtemp(join(tmpdir(), 'capture-write-'));

    await writeEvent({ storePath, id: ID, content: CONTENT });

    const entries = await readdir(join(storePath, 'content', 'events'));
    expect(entries).toEqual([`${ID}.md`]);
  });
});
