import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveRunningPackageRoot } from '../../lib/running-package.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { buildContentTree } from './build-content-tree.ts';

describe('install (designated-writer guard)', () => {
  let tempDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-install-guard-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    contentDir = path.join(tempDir, 'content');
    await mkdir(path.join(tempDir, '.agents'), { recursive: true });
    await mkdir(path.join(tempDir, '.claude', 'skills'), { recursive: true });
    await buildContentTree(contentDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  /** Sets `home-writer` in the temp home's user-global declaration. */
  async function designateWriter(writerPath: string): Promise<void> {
    await writeFile(path.join(tempDir, '.agents', 'codeassembly.yaml'), `home-writer: ${writerPath}\n`, 'utf8');
  }

  it('refuses a mismatched installation before writing anything', async () => {
    await designateWriter(path.join(tempDir, 'designated'));

    await expect(installCommand(makeOptions(), tempDir, contentDir)).rejects.toThrow(
      /not the designated home-domain writer/,
    );
    expect(existsSync(path.join(tempDir, '.claude', 'skills', '_data'))).toBe(false);
  });

  it('refuses a dry run exactly as it refuses the real one', async () => {
    await designateWriter(path.join(tempDir, 'designated'));

    await expect(installCommand(makeOptions({ dryRun: true }), tempDir, contentDir)).rejects.toThrow(
      /not the designated home-domain writer/,
    );
  });

  it('proceeds when the setting designates the running installation', async () => {
    await designateWriter(resolveRunningPackageRoot());

    await installCommand(makeOptions(), tempDir, contentDir);

    expect(existsSync(path.join(tempDir, '.claude', 'skills', '_data'))).toBe(true);
  });

  it('proceeds from a mismatched installation under --override-writer', async () => {
    await designateWriter(path.join(tempDir, 'designated'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      await installCommand(makeOptions({ shouldOverrideWriter: true }), tempDir, contentDir);
      expect(warn.mock.calls.flat().join('\n')).toContain('--override-writer');
    } finally {
      warn.mockRestore();
    }
    expect(existsSync(path.join(tempDir, '.claude', 'skills', '_data'))).toBe(true);
  });
});
