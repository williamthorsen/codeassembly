import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assertDesignatedWriter } from '../home-writer-guard.ts';

describe(assertDesignatedWriter, () => {
  let homeDir: string;
  let packageRoot: string;

  beforeEach(async () => {
    const tempDir = path.join(
      tmpdir(),
      `agents-test-writer-guard-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    homeDir = path.join(tempDir, 'home');
    packageRoot = path.join(tempDir, 'worktree', 'packages', 'agents');
    await mkdir(path.join(homeDir, '.agents'), { recursive: true });
    await mkdir(packageRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(path.dirname(homeDir), { recursive: true, force: true });
  });

  /** Writes one tier of the home declaration chain, `local` targeting the gitignored override file. */
  async function writeDeclaration(body: string, tier: 'base' | 'local' = 'base'): Promise<string> {
    const fileName = tier === 'base' ? 'codeassembly.yaml' : 'codeassembly.local.yaml';
    const filePath = path.join(homeDir, '.agents', fileName);
    await writeFile(filePath, body, 'utf8');
    return filePath;
  }

  it('passes when no home tier sets the setting', async () => {
    await writeDeclaration('skills:\n  use:\n    - commit\n');

    await expect(assertDesignatedWriter({ command: 'install', homeDir, packageRoot })).resolves.toBeUndefined();
  });

  it('passes when no home declaration exists at all', async () => {
    await expect(assertDesignatedWriter({ command: 'install', homeDir, packageRoot })).resolves.toBeUndefined();
  });

  it('passes when the setting names the package root itself', async () => {
    await writeDeclaration(`home-writer: ${packageRoot}\n`);

    await expect(assertDesignatedWriter({ command: 'install', homeDir, packageRoot })).resolves.toBeUndefined();
  });

  it('passes when the package root lies under the designated worktree', async () => {
    await writeDeclaration(`home-writer: ${path.resolve(packageRoot, '../..')}\n`);

    await expect(assertDesignatedWriter({ command: 'install', homeDir, packageRoot })).resolves.toBeUndefined();
  });

  it('expands a leading tilde against the home directory', async () => {
    const designated = path.join(homeDir, 'worktrees', 'live');
    await mkdir(designated, { recursive: true });
    await writeDeclaration('home-writer: ~/worktrees/live\n');

    await expect(
      assertDesignatedWriter({ command: 'install', homeDir, packageRoot: designated }),
    ).resolves.toBeUndefined();
  });

  it('matches through a symlinked invocation path', async () => {
    const designated = path.resolve(packageRoot, '../..');
    const linkPath = path.join(path.dirname(homeDir), 'worktree-link');
    await symlink(designated, linkPath);
    await writeDeclaration(`home-writer: ${designated}\n`);

    await expect(
      assertDesignatedWriter({ command: 'install', homeDir, packageRoot: path.join(linkPath, 'packages', 'agents') }),
    ).resolves.toBeUndefined();
  });

  it('refuses a mismatched installation, naming both paths, the config file, and the remedies', async () => {
    const designated = path.join(path.dirname(homeDir), 'designated');
    const configPath = await writeDeclaration(`home-writer: ${designated}\n`);

    const failure = assertDesignatedWriter({ command: 'sync --global', homeDir, packageRoot });

    await expect(failure).rejects.toThrow(/Refusing to run `sync --global`/);
    await expect(failure).rejects.toThrow(designated);
    await expect(failure).rejects.toThrow(packageRoot);
    await expect(failure).rejects.toThrow(configPath);
    await expect(failure).rejects.toThrow(/--override-writer/);
  });

  it('refuses a sibling path that merely shares a prefix with the designated one', async () => {
    await writeDeclaration(`home-writer: ${packageRoot}-other\n`);

    await expect(assertDesignatedWriter({ command: 'install', homeDir, packageRoot })).rejects.toThrow(
      /not the designated home-domain writer/,
    );
  });

  it('lets the local tier override the base tier', async () => {
    await writeDeclaration(`home-writer: ${path.join(path.dirname(homeDir), 'designated')}\n`);
    await writeDeclaration(`home-writer: ${packageRoot}\n`, 'local');

    await expect(assertDesignatedWriter({ command: 'install', homeDir, packageRoot })).resolves.toBeUndefined();
  });

  it('fails on an empty value rather than lapsing into dormancy', async () => {
    await writeDeclaration("home-writer: ''\n");

    await expect(assertDesignatedWriter({ command: 'install', homeDir, packageRoot })).rejects.toThrow(
      /Invalid `home-writer`/,
    );
  });

  it('fails on a relative path', async () => {
    await writeDeclaration('home-writer: ../elsewhere\n');

    await expect(assertDesignatedWriter({ command: 'install', homeDir, packageRoot })).rejects.toThrow(
      /expected an absolute path/,
    );
  });

  it('proceeds under --override-writer and reports the override', async () => {
    const designated = path.join(path.dirname(homeDir), 'designated');
    await writeDeclaration(`home-writer: ${designated}\n`);
    using silent = silenceConsole(['warn']);

    await expect(
      assertDesignatedWriter({ command: 'install', homeDir, packageRoot, shouldOverrideWriter: true }),
    ).resolves.toBeUndefined();
    expect(silent.warn.mock.calls.flat().join('\n')).toContain(designated);
  });
});
