import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InstallOptions } from '../../../lib/types.ts';
import { buildContentTree } from '../../test-utils/build-content-tree.ts';
import { declareFixtureSource, FIXTURE_SOURCE_NAME } from '../../test-utils/declare-fixture-source.ts';
import { syncGlobalCommand } from '../sync.ts';

// `sync --global` delivers a source's support directories (e.g. `_data`) through the `renderSkillDirectory` walk,
// which drops `_partials` at every depth.
describe('sync --global support-directory _partials exclusion', () => {
  let homeDir: string;
  let contentDir: string;

  beforeEach(async () => {
    homeDir = path.join(tmpdir(), `agents-test-global-support-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    contentDir = path.join(homeDir, 'content');
    await mkdir(path.join(homeDir, '.claude', 'skills'), { recursive: true });
    await mkdir(path.join(homeDir, '.claude', 'agents'), { recursive: true });
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  it('skips _partials nested at any depth inside a delivered support directory', async () => {
    await buildContentTree(contentDir);
    await declareFixtureSource(homeDir, contentDir);

    const supportSrc = path.join(contentDir, 'skills', 'nested-support');
    await mkdir(path.join(supportSrc, 'modules', '_partials'), { recursive: true });
    await writeFile(path.join(supportSrc, 'modules', 'sub.md'), '# Sub\n', 'utf8');
    await writeFile(path.join(supportSrc, 'modules', '_partials', 'inner.md'), 'inner partial\n', 'utf8');

    using _silent = silenceConsole(['info', 'warn']);
    await syncGlobalCommand(makeOptions(), homeDir);

    const supportRoot = path.join(homeDir, '.claude', 'skills', '_sources', FIXTURE_SOURCE_NAME, 'nested-support');
    expect(existsSync(path.join(supportRoot, 'modules', 'sub.md'))).toBe(true);
    expect(existsSync(path.join(supportRoot, 'modules', '_partials'))).toBe(false);
    expect(existsSync(path.join(supportRoot, 'modules', '_partials', 'inner.md'))).toBe(false);
  });
});
