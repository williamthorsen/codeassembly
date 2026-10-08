import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveRunningPackageRoot } from '../../lib/running-package.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { buildContentTree } from '../test-utils/build-content-tree.ts';
import { declareFixtureSource } from '../test-utils/declare-fixture-source.ts';

describe('install (designated-writer guard)', () => {
  let tempDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-install-guard-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    contentDir = path.join(tempDir, 'content');
    await mkdir(path.join(tempDir, '.agents'), { recursive: true });
    await mkdir(path.join(tempDir, '.claude', 'skills'), { recursive: true });
    await buildContentTree(contentDir);
    await declareFixtureSource(tempDir, contentDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  /** Sets `home-writer` in the temp home's user-global declaration. */
  async function designateWriter(writerPath: string): Promise<void> {
    await declareFixtureSource(tempDir, contentDir, `home-writer: ${writerPath}\n`);
  }

  it('refuses a mismatched installation before writing anything', async () => {
    await designateWriter(path.join(tempDir, 'designated'));

    await expect(installCommand(makeOptions(), tempDir)).rejects.toThrow(/not the designated home-domain writer/);
    expect(existsSync(path.join(tempDir, '.claude', 'scripts', 'demo.sh'))).toBe(false);
  });

  it('refuses a dry run exactly as it refuses the real one', async () => {
    await designateWriter(path.join(tempDir, 'designated'));

    await expect(installCommand(makeOptions({ dryRun: true }), tempDir)).rejects.toThrow(
      /not the designated home-domain writer/,
    );
  });

  it('proceeds when the setting designates the running installation', async () => {
    await designateWriter(resolveRunningPackageRoot());

    await installCommand(makeOptions(), tempDir);

    expect(existsSync(path.join(tempDir, '.claude', 'scripts', 'demo.sh'))).toBe(true);
  });

  it('proceeds from a mismatched installation under --override-writer', async () => {
    await designateWriter(path.join(tempDir, 'designated'));
    using stdio = captureStdio({ includeConsole: true });

    await installCommand(makeOptions({ shouldOverrideWriter: true }), tempDir);
    expect(stdio.stderr).toContain('--override-writer');
    expect(existsSync(path.join(tempDir, '.claude', 'scripts', 'demo.sh'))).toBe(true);
  });
});
