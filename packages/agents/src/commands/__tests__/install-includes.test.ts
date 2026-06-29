import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { buildContentTree } from './build-content-tree.ts';

describe('install harness-skill _partials exclusion', () => {
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

  // Install still transforms and deploys harness skills, so it exercises the `renderSkillDirectory` walk that drops
  // `_partials` at every depth. The remaining include/tool-name/link transform behavior is covered by the
  // `skill-transform`, `directive-expander`, `subagent-transform`, `sync`, and `install-reviewer-partials` suites.
  it('skips _partials nested at any depth inside an installed harness skill', async () => {
    await buildContentTree(contentDir, {
      harnessSkills: {
        claude: {
          'nested-partials': {
            'SKILL.md': ['---', 'name: nested-partials', 'description: Demo', '---', '', '# Demo', ''].join('\n'),
            'modules/sub.md': '# Sub\n',
            'modules/_partials/inner.md': 'inner partial\n',
          },
        },
      },
    });

    await installCommand(makeOptions(), tempDir, contentDir);

    const skillRoot = path.join(tempDir, '.claude', 'skills', 'nested-partials');
    expect(existsSync(path.join(skillRoot, 'modules', 'sub.md'))).toBe(true);
    expect(existsSync(path.join(skillRoot, 'modules', '_partials'))).toBe(false);
    expect(existsSync(path.join(skillRoot, 'modules', '_partials', 'inner.md'))).toBe(false);
  });
});
