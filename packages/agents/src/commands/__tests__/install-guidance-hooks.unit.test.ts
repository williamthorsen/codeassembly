import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { buildContentTree } from '../test-utils/build-content-tree.ts';

// A declared guidance hook is inert until a binding fills it, and `install` resolves no declaration, so every hook it
// meets is unbound. These pin that the directive reaches no installed file along either of install's render routes:
// the support-entry render, and the direct expansion route harness guidance takes.
describe('install guidance-hook strip', () => {
  let tempDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-hooks-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

  it('installs a hook-bearing support entry and harness guidance carrying no directive', async () => {
    await buildContentTree(contentDir, {
      dataFiles: { 'sample.md': '# Sample\n\n<!-- guidance-hook: implementation-preferences -->\n\nRows.\n' },
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

    await installCommand(makeOptions(), tempDir, contentDir);

    const support = await readFile(path.join(tempDir, '.claude', 'skills', '_data', 'sample.md'), 'utf8');
    expect(support).not.toContain('guidance-hook');
    expect(support).toContain('Rows.');

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

    await expect(installCommand(makeOptions(), tempDir, contentDir)).rejects.toThrow(
      /guidance\/_harnesses\/claude\/CLAUDE\.md:2 name="preferences" firstDeclaredAt=1 reason=duplicate-hook/,
    );
  });
});
