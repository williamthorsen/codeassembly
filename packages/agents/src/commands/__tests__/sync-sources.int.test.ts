import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveContentDir } from '../../lib/content-resolver.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { syncCommand } from '../sync.ts';

// Syncs a project that draws a rulebook from a declared source alongside one from the real content library, to catch
// failures that only show up when composing a source over the real catalog end-to-end.
describe('sync with a declared source (real library fallback)', () => {
  let projectRoot: string;
  let sourceDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    projectRoot = path.join(tmpdir(), `agents-test-sync-sources-int-proj-${stamp}`);
    sourceDir = path.join(tmpdir(), `agents-test-sync-sources-int-src-${stamp}`);
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await mkdir(path.join(sourceDir, 'guidance', 'rulebooks'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  async function declare(body: string): Promise<void> {
    await writeFile(
      path.join(projectRoot, '.agents', 'codeassembly.yaml'),
      `sources:\n  - name: org\n    path: ${sourceDir}\n${body}`,
      'utf8',
    );
  }

  const neutralPath = (slug: string): string => path.join(projectRoot, '.agents', 'rulebooks', `${slug}.md`);

  it('deploys a source ambient rulebook and a real library rulebook together, then retracts the source one', async () => {
    await writeFile(
      path.join(sourceDir, 'guidance', 'rulebooks', 'org-rules.md'),
      '---\nslug: org-rules\ndelivery: ambient\n---\n\n# Org rules\n\nSource-provided guidance.\n',
      'utf8',
    );
    await declare('rulebooks:\n  use:\n    - org-rules\n    - shell-conventions\n');

    await syncCommand(makeOptions(), projectRoot, resolveContentDir());

    expect(await readFile(neutralPath('org-rules'), 'utf8')).toContain('Source-provided guidance.');
    expect(await readFile(neutralPath('shell-conventions'), 'utf8')).toContain('# Shell script conventions');
    const projectMd = await readFile(path.join(projectRoot, '.agents', 'PROJECT.md'), 'utf8');
    expect(projectMd).toContain('<!-- rulebook:org-rules -->');
    expect(projectMd).toContain('Source-provided guidance.');

    await declare('rulebooks:\n  use:\n    - shell-conventions\n');
    await syncCommand(makeOptions(), projectRoot, resolveContentDir());

    expect(existsSync(neutralPath('org-rules'))).toBe(false);
    expect(existsSync(neutralPath('shell-conventions'))).toBe(true);
    expect(await readFile(path.join(projectRoot, '.agents', 'PROJECT.md'), 'utf8')).not.toContain(
      '<!-- rulebook:org-rules -->',
    );
  });
});
