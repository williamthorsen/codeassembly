import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listPromptDirectory, MAX_PROMPT_FILE_BYTES, readPromptDirectoryFile } from '../prompt-directory.ts';

describe('the prompts directory', () => {
  let root = '';
  let directory = '';

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'prompt-directory-'));
    directory = path.join(root, 'prompts');
    await mkdir(directory);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe(listPromptDirectory, () => {
    it('groups prompts and agent-logic files by base name, sorted by name', async () => {
      await writeFiles(['refund.md', 'refund.agent-logic.json', 'greeter.agent-logic.json', 'reset.txt']);

      expect(await listPromptDirectory(directory)).toStrictEqual({
        ok: true,
        entries: [
          { name: 'greeter', agentLogicFile: 'greeter.agent-logic.json' },
          { name: 'refund', promptFile: 'refund.md', agentLogicFile: 'refund.agent-logic.json' },
          { name: 'reset', promptFile: 'reset.txt' },
        ],
      });
    });

    it('prefers the .md prompt when a .txt prompt shares its base name', async () => {
      await writeFiles(['refund.txt', 'refund.md']);

      expect(await listPromptDirectory(directory)).toStrictEqual({
        ok: true,
        entries: [{ name: 'refund', promptFile: 'refund.md' }],
      });
    });

    it('lists a prompt named like an agent-logic file under its own base name', async () => {
      await writeFiles(['refund.agent-logic.md']);

      expect(await listPromptDirectory(directory)).toStrictEqual({
        ok: true,
        entries: [{ name: 'refund.agent-logic', promptFile: 'refund.agent-logic.md' }],
      });
    });

    it('leaves out other files, dotfiles, subdirectories, and symlinks', async () => {
      await writeFiles(['refund.problems.json', 'notes.pdf', '.hidden.md', '.md', 'outside.md']);
      await mkdir(path.join(directory, 'nested.md'));
      await writeFile(path.join(root, 'secret.md'), 'secret');
      await symlink(path.join(root, 'secret.md'), path.join(directory, 'linked.md'));

      expect(await listPromptDirectory(directory)).toStrictEqual({
        ok: true,
        entries: [{ name: 'outside', promptFile: 'outside.md' }],
      });
    });

    it('reports a directory that does not exist', async () => {
      expect(await listPromptDirectory(path.join(root, 'absent'))).toStrictEqual({ ok: false, reason: 'missing' });
    });
  });

  describe(readPromptDirectoryFile, () => {
    it('returns the text of a listed file', async () => {
      await writeFile(path.join(directory, 'refund.md'), 'Greet the customer.');

      expect(await readPromptDirectoryFile(directory, 'refund.md')).toStrictEqual({
        ok: true,
        text: 'Greet the customer.',
      });
    });

    it.each([
      ['a traversal', '../secret.md'],
      ['an absolute path', '/etc/hosts'],
      ['a symlink', 'linked.md'],
      ['an unlisted file', 'refund.problems.json'],
    ])('refuses %s', async (_condition, fileName) => {
      await writeFile(path.join(root, 'secret.md'), 'secret');
      await symlink(path.join(root, 'secret.md'), path.join(directory, 'linked.md'));
      await writeFile(path.join(directory, 'refund.problems.json'), '{}');

      expect(await readPromptDirectoryFile(directory, fileName)).toStrictEqual({ ok: false, reason: 'not-listed' });
    });

    it('refuses a file over 1 MiB', async () => {
      await writeFile(path.join(directory, 'huge.md'), 'x'.repeat(MAX_PROMPT_FILE_BYTES + 1));

      expect(await readPromptDirectoryFile(directory, 'huge.md')).toStrictEqual({ ok: false, reason: 'too-large' });
    });

    it('reports a directory that does not exist', async () => {
      expect(await readPromptDirectoryFile(path.join(root, 'absent'), 'refund.md')).toStrictEqual({
        ok: false,
        reason: 'missing',
      });
    });
  });

  async function writeFiles(names: string[]): Promise<void> {
    await Promise.all(names.map((name) => writeFile(path.join(directory, name), name)));
  }
});
