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
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: [], skills: [], subagents: [] });
  });

  it('resolves additive rulebook use from a single project file, deduplicating', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\n    - beta\n    - alpha\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: ['alpha', 'beta'], skills: [], subagents: [] });
  });

  it('resolves additive skill use from a single project file, deduplicating', async () => {
    await writeProject('skills:\n  use:\n    - one\n    - two\n    - one\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: [], skills: ['one', 'two'], subagents: [] });
  });

  it('resolves additive subagent use from a single project file, deduplicating', async () => {
    await writeProject('subagents:\n  use:\n    - canary\n    - other\n    - canary\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: [], skills: [], subagents: ['canary', 'other'] });
  });

  it('resolves rulebooks, skills, and subagents together from one file', async () => {
    await writeProject(
      'rulebooks:\n  use:\n    - alpha\nskills:\n  use:\n    - one\nsubagents:\n  use:\n    - canary\n',
    );
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: ['alpha'],
      skills: ['one'],
      subagents: ['canary'],
    });
  });

  it('combines each category additively across the project and project-local tiers', async () => {
    await writeProject(
      'rulebooks:\n  use:\n    - alpha\nskills:\n  use:\n    - one\nsubagents:\n  use:\n    - canary\n',
    );
    await writeLocal('rulebooks:\n  use:\n    - beta\nskills:\n  use:\n    - two\nsubagents:\n  use:\n    - other\n');
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: ['alpha', 'beta'],
      skills: ['one', 'two'],
      subagents: ['canary', 'other'],
    });
  });

  it('lets a higher tier drop a rulebook inherited from a lower tier', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\n    - beta\n');
    await writeLocal('rulebooks:\n  drop:\n    - alpha\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: ['beta'], skills: [], subagents: [] });
  });

  it('lets a higher tier drop a skill inherited from a lower tier', async () => {
    await writeProject('skills:\n  use:\n    - one\n    - two\n');
    await writeLocal('skills:\n  drop:\n    - one\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: [], skills: ['two'], subagents: [] });
  });

  it('lets a higher tier drop a subagent inherited from a lower tier', async () => {
    await writeProject('subagents:\n  use:\n    - canary\n    - other\n');
    await writeLocal('subagents:\n  drop:\n    - canary\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: [], skills: [], subagents: ['other'] });
  });

  it('discards every category from lower tiers when a higher tier declares root: true', async () => {
    await writeProject(
      'rulebooks:\n  use:\n    - alpha\nskills:\n  use:\n    - one\nsubagents:\n  use:\n    - canary\n',
    );
    await writeLocal(
      'root: true\nrulebooks:\n  use:\n    - beta\nskills:\n  use:\n    - two\nsubagents:\n  use:\n    - other\n',
    );
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: ['beta'],
      skills: ['two'],
      subagents: ['other'],
    });
  });

  it('resolves the project-local tier alone when the project file is absent', async () => {
    await writeLocal('skills:\n  use:\n    - gamma\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: [], skills: ['gamma'], subagents: [] });
  });

  it('throws a clear error for a non-empty collections category', async () => {
    await writeProject('collections:\n  use:\n    - some-collection\n');
    await expect(resolveDeclaration({ cwd })).rejects.toThrow(/collections.*not supported/i);
  });

  it('tolerates an empty collections block, resolving rulebooks, skills, and subagents', async () => {
    await writeProject(
      'rulebooks:\n  use:\n    - alpha\nskills:\n  use:\n    - one\nsubagents:\n  use:\n    - canary\ncollections:\n  use: []\n',
    );
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: ['alpha'],
      skills: ['one'],
      subagents: ['canary'],
    });
  });

  it('does not read a legacy rulebooks.yaml: it returns undefined when only that file is present', async () => {
    await writeLegacy('rulebooks:\n  - alpha\n');
    expect(await resolveDeclaration({ cwd })).toBeUndefined();
  });
});
