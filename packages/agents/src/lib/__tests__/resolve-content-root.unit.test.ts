import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveContentRoot } from '../resolve-content-root.ts';

describe(resolveContentRoot, () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = path.join(tmpdir(), `agents-test-content-root-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('resolves an explicit --content against the working directory', async () => {
    expect(await resolveContentRoot('content', projectDir, 'validate')).toBe(path.join(projectDir, 'content'));
  });

  it("falls back to the content root declared by the working directory's package.json", async () => {
    await writeManifest(projectDir, { codeassembly: { content: 'guidance' } });

    expect(await resolveContentRoot(undefined, projectDir, 'validate')).toBe(path.join(projectDir, 'guidance'));
  });

  it('prefers an explicit --content over the declared key', async () => {
    await writeManifest(projectDir, { codeassembly: { content: 'guidance' } });

    expect(await resolveContentRoot('other', projectDir, 'validate')).toBe(path.join(projectDir, 'other'));
  });

  it('names the purpose and both routes when the package.json does not declare a content root', async () => {
    await writeManifest(projectDir, { name: 'no-content-here' });

    await expect(resolveContentRoot(undefined, projectDir, 'bundle helpers from')).rejects.toThrow(
      /^No content root to bundle helpers from: .*Pass --content <dir>, or add the key\.$/,
    );
  });

  it('names the purpose and both routes when the working directory does not contain any package.json', async () => {
    await expect(resolveContentRoot(undefined, projectDir, 'validate')).rejects.toThrow(
      /^No content root to validate: .*doesn't exist\. Pass --content <dir>/,
    );
  });
});

// region | Helpers

/** Writes a `package.json` containing the given manifest object. */
async function writeManifest(dir: string, manifest: Record<string, unknown>): Promise<void> {
  await writeFile(path.join(dir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8');
}

// endregion | Helpers
