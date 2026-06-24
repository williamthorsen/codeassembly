import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveDeclaration } from '../codeassembly-manifest.ts';

describe(resolveDeclaration, () => {
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
    expect(await resolveDeclaration({ cwd })).toBeUndefined();
  });

  it('returns empty category lists when a file is present but declares nothing', async () => {
    await writeProject('# nothing declared yet\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: [], skills: [] });
  });

  it('resolves additive rulebook use from a single project file, deduplicating', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\n    - beta\n    - alpha\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: ['alpha', 'beta'], skills: [] });
  });

  it('resolves additive skill use from a single project file, deduplicating', async () => {
    await writeProject('skills:\n  use:\n    - one\n    - two\n    - one\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: [], skills: ['one', 'two'] });
  });

  it('resolves rulebooks and skills together from one file', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\nskills:\n  use:\n    - one\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: ['alpha'], skills: ['one'] });
  });

  it('combines each category additively across the project and project-local tiers', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\nskills:\n  use:\n    - one\n');
    await writeLocal('rulebooks:\n  use:\n    - beta\nskills:\n  use:\n    - two\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: ['alpha', 'beta'], skills: ['one', 'two'] });
  });

  it('lets a higher tier drop a rulebook inherited from a lower tier', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\n    - beta\n');
    await writeLocal('rulebooks:\n  drop:\n    - alpha\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: ['beta'], skills: [] });
  });

  it('lets a higher tier drop a skill inherited from a lower tier', async () => {
    await writeProject('skills:\n  use:\n    - one\n    - two\n');
    await writeLocal('skills:\n  drop:\n    - one\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: [], skills: ['two'] });
  });

  it('discards every category from lower tiers when a higher tier declares root: true', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\nskills:\n  use:\n    - one\n');
    await writeLocal('root: true\nrulebooks:\n  use:\n    - beta\nskills:\n  use:\n    - two\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: ['beta'], skills: ['two'] });
  });

  it('resolves the project-local tier alone when the project file is absent', async () => {
    await writeLocal('skills:\n  use:\n    - gamma\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: [], skills: ['gamma'] });
  });

  it('throws a clear error for a non-empty subagents category', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\nsubagents:\n  use:\n    - some-agent\n');
    await expect(resolveDeclaration({ cwd })).rejects.toThrow(/subagents.*not supported/i);
  });

  it('throws a clear error for a non-empty collections category', async () => {
    await writeProject('collections:\n  use:\n    - some-collection\n');
    await expect(resolveDeclaration({ cwd })).rejects.toThrow(/collections.*not supported/i);
  });

  it('tolerates empty unsupported category blocks, resolving rulebooks and skills', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\nskills:\n  use:\n    - one\nsubagents:\n  use: []\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: ['alpha'], skills: ['one'] });
  });

  it('does not read a legacy rulebooks.yaml: it returns undefined when only that file is present', async () => {
    await writeLegacy('rulebooks:\n  - alpha\n');
    expect(await resolveDeclaration({ cwd })).toBeUndefined();
  });
});
