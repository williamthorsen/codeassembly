import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { isEventPushed } from '../event-push-state.ts';

const execFileAsync = promisify(execFile);

const ID = '01HZZZZZZZZZZZZZZZZZZZZZZZZ';

describe(isEventPushed, () => {
  it('returns true when the event is present in the upstream branch', async () => {
    const store = await makeGitStore();
    await writeEventFile(store, ID);
    await commit(store, 'add event');
    await pushSettingUpstream(store);

    expect(await isEventPushed({ storePath: store, id: ID })).toBe(true);
  });

  it('returns false when the event is committed but not yet pushed', async () => {
    const store = await makeGitStore();
    await establishUpstream(store);
    await writeEventFile(store, ID);
    await commit(store, 'add event');

    expect(await isEventPushed({ storePath: store, id: ID })).toBe(false);
  });

  it('returns false when the event is written but uncommitted', async () => {
    const store = await makeGitStore();
    await establishUpstream(store);
    await writeEventFile(store, ID);

    expect(await isEventPushed({ storePath: store, id: ID })).toBe(false);
  });

  it('returns false when the store has no upstream configured', async () => {
    const store = await mkdtemp(join(tmpdir(), 'push-noupstream-'));
    await execFileAsync('git', ['-C', store, 'init', '--quiet', '-b', 'main']);
    await writeEventFile(store, ID);

    expect(await isEventPushed({ storePath: store, id: ID })).toBe(false);
  });

  it('returns false when the store is not a git repository', async () => {
    const store = await mkdtemp(join(tmpdir(), 'push-nogit-'));
    await writeEventFile(store, ID);

    expect(await isEventPushed({ storePath: store, id: ID })).toBe(false);
  });
});

// region | Helpers

/** Init a store repo on `main` with an identity configured and `origin` pointing at a fresh bare remote. */
async function makeGitStore(): Promise<string> {
  const remote = await mkdtemp(join(tmpdir(), 'push-remote-'));
  await execFileAsync('git', ['init', '--quiet', '--bare', '-b', 'main', remote]);

  const store = await mkdtemp(join(tmpdir(), 'push-store-'));
  await execFileAsync('git', ['-C', store, 'init', '--quiet', '-b', 'main']);
  await execFileAsync('git', ['-C', store, 'config', 'user.email', 'test@example.com']);
  await execFileAsync('git', ['-C', store, 'config', 'user.name', 'Test']);
  await execFileAsync('git', ['-C', store, 'remote', 'add', 'origin', remote]);
  return store;
}

/** Seed an initial pushed commit so `@{upstream}` resolves, without putting the event into the remote. */
async function establishUpstream(store: string): Promise<void> {
  await writeFile(join(store, 'README.md'), 'seed\n', 'utf8');
  await commit(store, 'seed');
  await pushSettingUpstream(store);
}

/** Write an event note into the store's `content/events` tree. */
async function writeEventFile(store: string, id: string): Promise<void> {
  const dir = join(store, 'content', 'events');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}.md`), '---\nrecordType: event\n---\n\nBody.\n', 'utf8');
}

async function commit(store: string, message: string): Promise<void> {
  await execFileAsync('git', ['-C', store, 'add', '-A']);
  await execFileAsync('git', ['-C', store, 'commit', '--quiet', '-m', message]);
}

async function pushSettingUpstream(store: string): Promise<void> {
  await execFileAsync('git', ['-C', store, 'push', '--quiet', '-u', 'origin', 'main']);
}

// endregion | Helpers
