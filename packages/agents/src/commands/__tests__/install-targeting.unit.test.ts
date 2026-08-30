import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HARNESSES } from '../../lib/harness.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { buildContentTree } from '../test-utils/build-content-tree.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

describe('install harness targeting', () => {
  let tempDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-install-targeting-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    contentDir = path.join(tempDir, 'content');
    await mkdir(tempDir, { recursive: true });
    await buildContentTree(contentDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('installs into the declared harness alone, with both homes present', async () => {
    using silent = silenceConsole(['info', 'warn']);
    await setupHarnessHomes();
    await declareHarnesses('harnesses:\n  use:\n    - claude\n');

    await installCommand(makeOptions(), tempDir, contentDir);

    expect(existsSync(path.join(tempDir, '.claude', 'skills', '_data'))).toBe(true);
    expect(existsSync(path.join(tempDir, ROVO_HOME, 'skills', '_data'))).toBe(false);
    expect(infoLines(silent)).toContain('Targeting claude (declared).');
  });

  it('falls back to the installed harnesses when no file declares the block', async () => {
    using silent = silenceConsole(['info', 'warn']);
    await setupHarnessHomes();

    await installCommand(makeOptions(), tempDir, contentDir);

    expect(existsSync(path.join(tempDir, '.claude', 'skills', '_data'))).toBe(true);
    expect(existsSync(path.join(tempDir, ROVO_HOME, 'skills', '_data'))).toBe(true);
    expect(infoLines(silent)).toContain('Targeting claude, rovo (detected in ~).');
  });

  it('installs into a declared harness whose home does not yet exist', async () => {
    using silent = silenceConsole(['info', 'warn']);
    await declareHarnesses('harnesses:\n  use:\n    - rovo\n');

    await installCommand(makeOptions(), tempDir, contentDir);

    expect(existsSync(path.join(tempDir, ROVO_HOME, 'skills', '_data'))).toBe(true);
    expect(infoLines(silent)).toContain('Targeting rovo (declared).');
  });

  it('reports a flag-narrowed run as decided by the flag, reading no declaration', async () => {
    using silent = silenceConsole(['info', 'warn']);
    await setupHarnessHomes();
    await declareHarnesses('harnesses:\n  use:\n    - rovo\n');

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    expect(existsSync(path.join(tempDir, '.claude', 'skills', '_data'))).toBe(true);
    expect(infoLines(silent)).toContain('Targeting claude (--harness claude).');
  });

  // region | Helpers

  /** Writes the home tier's declaration file, which is where `install` reads the `harnesses:` block from. */
  async function declareHarnesses(body: string): Promise<void> {
    await mkdir(path.join(tempDir, '.agents'), { recursive: true });
    await writeFile(path.join(tempDir, '.agents', 'codeassembly.yaml'), body, 'utf8');
  }

  function infoLines(silent: ReturnType<typeof silenceConsole>): ReadonlyArray<string> {
    return silent.info.mock.calls.map((call) => String(call[0]));
  }

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'all', link: false, force: false, dryRun: false, hooks: false, ...overrides };
  }

  /** Creates both harness homes, so detection finds each and a declaration has something to narrow. */
  async function setupHarnessHomes(): Promise<void> {
    await mkdir(path.join(tempDir, '.claude', 'skills'), { recursive: true });
    await mkdir(path.join(tempDir, ROVO_HOME, 'skills'), { recursive: true });
  }

  // endregion | Helpers
});
