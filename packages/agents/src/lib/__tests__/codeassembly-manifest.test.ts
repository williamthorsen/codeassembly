import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveRulebookDeclaration } from '../codeassembly-manifest.ts';

describe(resolveRulebookDeclaration, () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = path.join(tmpdir(), `agents-test-cam-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(path.join(cwd, '.agents'), { recursive: true });
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  /** Writes the project-scope `codeassembly.yaml`. */
  async function writeProject(content: string): Promise<void> {
    await writeFile(path.join(cwd, '.agents', 'codeassembly.yaml'), content, 'utf8');
  }

  /** Writes the project-local `codeassembly.local.yaml`. */
  async function writeLocal(content: string): Promise<void> {
    await writeFile(path.join(cwd, '.agents', 'codeassembly.local.yaml'), content, 'utf8');
  }

  /** Writes a legacy flat-format `rulebooks.yaml`, which the resolver does not read. */
  async function writeLegacy(content: string): Promise<void> {
    await writeFile(path.join(cwd, '.agents', 'rulebooks.yaml'), content, 'utf8');
  }

  it('returns undefined when no codeassembly.yaml exists in any tier', async () => {
    expect(await resolveRulebookDeclaration({ cwd })).toBeUndefined();
  });

  it('returns an empty list when a file is present but declares no rulebooks', async () => {
    await writeProject('# nothing declared yet\n');
    expect(await resolveRulebookDeclaration({ cwd })).toEqual([]);
  });

  it('resolves additive use from a single project file, deduplicating', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\n    - beta\n    - alpha\n');
    expect(await resolveRulebookDeclaration({ cwd })).toEqual(['alpha', 'beta']);
  });

  it('combines use additively across the project and project-local tiers', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\n');
    await writeLocal('rulebooks:\n  use:\n    - beta\n');
    expect(await resolveRulebookDeclaration({ cwd })).toEqual(['alpha', 'beta']);
  });

  it('lets a higher tier drop a slug inherited from a lower tier', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\n    - beta\n');
    await writeLocal('rulebooks:\n  drop:\n    - alpha\n');
    expect(await resolveRulebookDeclaration({ cwd })).toEqual(['beta']);
  });

  it('discards lower tiers when a higher tier declares root: true', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\n');
    await writeLocal('root: true\nrulebooks:\n  use:\n    - beta\n');
    expect(await resolveRulebookDeclaration({ cwd })).toEqual(['beta']);
  });

  it('resolves the project-local tier alone when the project file is absent', async () => {
    await writeLocal('rulebooks:\n  use:\n    - gamma\n');
    expect(await resolveRulebookDeclaration({ cwd })).toEqual(['gamma']);
  });

  it('throws a clear error for a non-empty unsupported category', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\nskills:\n  use:\n    - some-skill\n');
    await expect(resolveRulebookDeclaration({ cwd })).rejects.toThrow(/skills.*not supported/i);
  });

  it('tolerates an empty unsupported category block, resolving only rulebooks', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\nskills:\n  use: []\n');
    expect(await resolveRulebookDeclaration({ cwd })).toEqual(['alpha']);
  });

  it('does not read a legacy rulebooks.yaml: it returns undefined when only that file is present', async () => {
    await writeLegacy('rulebooks:\n  - alpha\n');
    expect(await resolveRulebookDeclaration({ cwd })).toBeUndefined();
  });
});
