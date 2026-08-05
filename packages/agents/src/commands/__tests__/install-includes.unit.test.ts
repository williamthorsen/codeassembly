import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { buildContentTree } from './build-content-tree.ts';

describe('install support-directory _partials exclusion', () => {
  let tempDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-includes-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    contentDir = path.join(tempDir, 'content');
    await mkdir(path.join(tempDir, '.claude', 'skills'), { recursive: true });
    await mkdir(path.join(tempDir, '.claude', 'agents'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  // Install transforms and deploys support directories (e.g. `_data`) via the `renderSkillDirectory` walk, which
  // drops `_partials` at every depth. The remaining include/tool-name/link transform behavior is covered by the
  // `skill-transform`, `directive-expander`, `subagent-transform`, `sync`, and `install-reviewer-partials` suites.
  it('skips _partials nested at any depth inside an installed support directory', async () => {
    await buildContentTree(contentDir);

    // Create a support directory (no SKILL.md) with _partials nested inside — install must exclude them.
    const supportSrc = path.join(contentDir, 'skills', 'nested-support');
    await mkdir(path.join(supportSrc, 'modules', '_partials'), { recursive: true });
    await writeFile(path.join(supportSrc, 'modules', 'sub.md'), '# Sub\n', 'utf8');
    await writeFile(path.join(supportSrc, 'modules', '_partials', 'inner.md'), 'inner partial\n', 'utf8');

    await installCommand(makeOptions(), tempDir, contentDir);

    const supportRoot = path.join(tempDir, '.claude', 'skills', 'nested-support');
    expect(existsSync(path.join(supportRoot, 'modules', 'sub.md'))).toBe(true);
    expect(existsSync(path.join(supportRoot, 'modules', '_partials'))).toBe(false);
    expect(existsSync(path.join(supportRoot, 'modules', '_partials', 'inner.md'))).toBe(false);
  });
});
