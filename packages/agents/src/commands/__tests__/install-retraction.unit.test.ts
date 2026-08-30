import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HARNESSES } from '../../lib/harness.ts';
import { getManifestPath, readManifest } from '../../lib/manifest.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { buildContentTree } from '../test-utils/build-content-tree.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

describe('install retraction of a de-declared harness', () => {
  let tempDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-install-retract-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    contentDir = path.join(tempDir, 'content');
    await mkdir(tempDir, { recursive: true });
    await buildContentTree(contentDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('removes the dropped harness files and its manifest key', async () => {
    using silent = silenceConsole(['info', 'warn']);
    await installBoth();
    expect(existsSync(path.join(tempDir, ROVO_HOME, 'skills', '_data'))).toBe(true);

    await declareHarnesses('harnesses:\n  use:\n    - claude\n');
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(existsSync(path.join(tempDir, ROVO_HOME, 'skills', '_data'))).toBe(false);
    expect(existsSync(path.join(tempDir, '.claude', 'skills', '_data'))).toBe(true);
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.rovo).toBeUndefined();
    expect(manifest.harnesses.claude?.entries.length).toBeGreaterThan(0);
    expect(silent.info.mock.calls.map((call) => String(call[0]))).toContain(
      '\nRetracting harness dropped from the declaration: rovo',
    );
  });

  it('unwires the dropped harness hook entries, so its config stops invoking the removed relay', async () => {
    using silent = silenceConsole(['info', 'warn']);
    await installBoth({ hooks: true });
    const rovoConfig = path.join(tempDir, ROVO_HOME, 'config.yml');
    expect(await readFile(rovoConfig, 'utf8')).toContain('relay-hook-event.mjs');

    await declareHarnesses('harnesses:\n  use:\n    - claude\n');
    await installCommand(makeOptions({ hooks: true }), tempDir, contentDir);

    expect(await readFile(rovoConfig, 'utf8')).not.toContain('relay-hook-event.mjs');
    expect(silent.warn.mock.calls).toHaveLength(0);
  });

  it('keeps a user-modified file without --force and tracks it alone', async () => {
    using silent = silenceConsole(['info', 'warn']);
    await installBoth();
    await writeFile(modifiedScriptPath(), EDITED_SCRIPT, 'utf8');

    await declareHarnesses('harnesses:\n  use:\n    - claude\n');
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(await readFile(modifiedScriptPath(), 'utf8')).toBe(EDITED_SCRIPT);
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.rovo?.entries.map((entry) => entry.relativePath)).toEqual(['scripts/demo.sh']);
    expect(silent.warn.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining('Keeping modified stale item'),
    );
  });

  it('removes a user-modified file when --force is set', async () => {
    using _silent = silenceConsole(['info', 'warn']);
    await installBoth();
    await writeFile(modifiedScriptPath(), EDITED_SCRIPT, 'utf8');

    await declareHarnesses('harnesses:\n  use:\n    - claude\n');
    await installCommand(makeOptions({ force: true }), tempDir, contentDir);

    expect(existsSync(modifiedScriptPath())).toBe(false);
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.rovo).toBeUndefined();
  });

  it('previews the retraction under --dry-run, writing neither disk nor manifest', async () => {
    using silent = silenceConsole(['info', 'warn']);
    await installBoth();

    await declareHarnesses('harnesses:\n  use:\n    - claude\n');
    await installCommand(makeOptions({ dryRun: true, hooks: true }), tempDir, contentDir);

    expect(existsSync(path.join(tempDir, ROVO_HOME, 'skills', '_data'))).toBe(true);
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.rovo?.entries.length).toBeGreaterThan(0);
    const lines = silent.info.mock.calls.map((call) => String(call[0]));
    expect(lines).toContainEqual(expect.stringContaining('[dry-run] Would remove stale item'));
    expect(lines).toContain('  [hooks] Would remove session-lifecycle hook entries');
  });

  it('retracts every harness when the declaration resolves to an empty set', async () => {
    using silent = silenceConsole(['info', 'warn']);
    await installBoth();

    await declareHarnesses('harnesses:\n  use: []\n');
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(existsSync(path.join(tempDir, '.claude', 'skills', '_data'))).toBe(false);
    expect(existsSync(path.join(tempDir, ROVO_HOME, 'skills', '_data'))).toBe(false);
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses).toEqual({});
    expect(silent.info.mock.calls.map((call) => String(call[0]))).toContain('Targeting no harnesses (declared).');
  });

  it('retracts nothing from the harnesses --harness excludes', async () => {
    using silent = silenceConsole(['info', 'warn']);
    await installBoth();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    expect(existsSync(path.join(tempDir, ROVO_HOME, 'skills', '_data'))).toBe(true);
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.rovo?.entries.length).toBeGreaterThan(0);
    expect(silent.info.mock.calls.map((call) => String(call[0]))).not.toContainEqual(
      expect.stringContaining('Retracting harness'),
    );
  });

  it('warns and completes the retraction when the dropped harness config cannot be parsed', async () => {
    using silent = silenceConsole(['info', 'warn']);
    await installBoth({ hooks: true });
    const rovoConfig = path.join(tempDir, ROVO_HOME, 'config.yml');
    await writeFile(rovoConfig, BROKEN_CONFIG, 'utf8');

    await declareHarnesses('harnesses:\n  use:\n    - claude\n');
    await installCommand(makeOptions({ hooks: true }), tempDir, contentDir);

    expect(silent.warn.mock.calls.map((call) => String(call[0]))).toContainEqual(
      expect.stringContaining('Skipping hook-entry removal'),
    );
    expect(await readFile(rovoConfig, 'utf8')).toBe(BROKEN_CONFIG);
    expect(existsSync(path.join(tempDir, ROVO_HOME, 'skills', '_data'))).toBe(false);
    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.rovo).toBeUndefined();
  });

  it('retracts nothing when detection settles the targets', async () => {
    using silent = silenceConsole(['info', 'warn']);
    await installBoth();
    await rm(path.join(tempDir, ROVO_HOME, 'skills'), { recursive: true, force: true });

    await installCommand(makeOptions(), tempDir, contentDir);

    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.rovo?.entries.length).toBeGreaterThan(0);
    expect(silent.info.mock.calls.map((call) => String(call[0]))).toContain('Targeting claude, rovo (detected in ~).');
  });

  // region | Helpers

  const BROKEN_CONFIG = 'hooks: [\n';

  const EDITED_SCRIPT = '#!/usr/bin/env bash\necho edited\n';

  /** Writes the home tier's declaration file, which is where `install` reads the `harnesses:` block from. */
  async function declareHarnesses(body: string): Promise<void> {
    await mkdir(path.join(tempDir, '.agents'), { recursive: true });
    await writeFile(path.join(tempDir, '.agents', 'codeassembly.yaml'), body, 'utf8');
  }

  /** Installs into both harness homes by detection, which is the state every retraction case starts from. */
  async function installBoth(overrides: Partial<InstallOptions> = {}): Promise<void> {
    await mkdir(path.join(tempDir, '.claude', 'skills'), { recursive: true });
    await mkdir(path.join(tempDir, ROVO_HOME, 'skills'), { recursive: true });
    await installCommand(makeOptions(overrides), tempDir, contentDir);
  }

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'all', link: false, force: false, dryRun: false, hooks: false, ...overrides };
  }

  /** A content-hashed entry in the rovo home, which is what drift detection can see an edit in. */
  function modifiedScriptPath(): string {
    return path.join(tempDir, ROVO_HOME, 'scripts', 'demo.sh');
  }

  // endregion | Helpers
});
