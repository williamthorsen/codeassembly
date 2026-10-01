import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { buildContentTree } from '../test-utils/build-content-tree.ts';
import { declareFixtureSource } from '../test-utils/declare-fixture-source.ts';

// A declared guidance hook is inert until a binding fills it, and `install` doesn't bind any hook, so every hook that it
// meets is unbound. These pin that the directive doesn't appear in installed harness guidance, which renders through
// the direct expansion route.
describe('install guidance-hook strip', () => {
  let tempDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-hooks-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    contentDir = path.join(tempDir, 'content');
    await mkdir(path.join(tempDir, '.claude', 'skills'), { recursive: true });
    await mkdir(path.join(tempDir, '.claude', 'agents'), { recursive: true });
    await declareFixtureSource(tempDir, contentDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  it('installs hook-bearing harness guidance without any directive', async () => {
    await buildContentTree(contentDir, {
      harnessGuidance: {
        claude: {
          'CLAUDE.md': [
            'Fixture claude preamble.',
            '',
            '<!-- guidance-hook: implementation-preferences -->',
            '',
            '<!-- codeassembly-ambient:start -->',
            '<!-- codeassembly-ambient:end -->',
            '',
          ].join('\n'),
        },
      },
    });

    await installCommand(makeOptions(), tempDir);

    const guidance = await readFile(path.join(tempDir, '.claude', 'CLAUDE.md'), 'utf8');
    expect(guidance).not.toContain('guidance-hook');
    expect(guidance).toContain('Fixture claude preamble.');
  });

  it('fails the install when harness guidance declares the same hook twice', async () => {
    await buildContentTree(contentDir, {
      harnessGuidance: {
        claude: {
          'CLAUDE.md': [
            '<!-- guidance-hook: preferences -->',
            '<!-- guidance-hook: preferences -->',
            '',
            '<!-- codeassembly-ambient:start -->',
            '<!-- codeassembly-ambient:end -->',
            '',
          ].join('\n'),
        },
      },
    });

    await expect(installCommand(makeOptions(), tempDir)).rejects.toThrow(
      /guidance\/_harnesses\/claude\/CLAUDE\.md:2 name="preferences" firstDeclaredAt=1 reason=duplicate-hook/,
    );
  });
});
