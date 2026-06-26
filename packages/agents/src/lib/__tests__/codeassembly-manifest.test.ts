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

  it('returns empty type lists when a file is present but declares nothing', async () => {
    await writeProject('# nothing declared yet\n');
    expect(await resolveDeclaration({ cwd })).toEqual({ rulebooks: [], skills: [], subagents: [], collections: [] });
  });

  it('resolves additive rulebook use from a single project file, deduplicating', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\n    - beta\n    - alpha\n');
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: ['alpha', 'beta'],
      skills: [],
      subagents: [],
      collections: [],
    });
  });

  it('resolves additive skill use from a single project file, deduplicating', async () => {
    await writeProject('skills:\n  use:\n    - one\n    - two\n    - one\n');
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: [],
      skills: ['one', 'two'],
      subagents: [],
      collections: [],
    });
  });

  it('resolves additive subagent use from a single project file, deduplicating', async () => {
    await writeProject('subagents:\n  use:\n    - canary\n    - other\n    - canary\n');
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: [],
      skills: [],
      subagents: ['canary', 'other'],
      collections: [],
    });
  });

  it('resolves additive collection use, leaving expansion of its members to the caller', async () => {
    await writeProject('collections:\n  use:\n    - recommended\n    - other\n    - recommended\n');
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: [],
      skills: [],
      subagents: [],
      collections: ['recommended', 'other'],
    });
  });

  it('resolves rulebooks, skills, subagents, and collections together from one file', async () => {
    await writeProject(
      'rulebooks:\n  use:\n    - alpha\nskills:\n  use:\n    - one\nsubagents:\n  use:\n    - canary\ncollections:\n  use:\n    - recommended\n',
    );
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: ['alpha'],
      skills: ['one'],
      subagents: ['canary'],
      collections: ['recommended'],
    });
  });

  it('combines each type additively across the project and project-local tiers', async () => {
    await writeProject(
      'rulebooks:\n  use:\n    - alpha\nskills:\n  use:\n    - one\nsubagents:\n  use:\n    - canary\n',
    );
    await writeLocal('rulebooks:\n  use:\n    - beta\nskills:\n  use:\n    - two\nsubagents:\n  use:\n    - other\n');
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: ['alpha', 'beta'],
      skills: ['one', 'two'],
      subagents: ['canary', 'other'],
      collections: [],
    });
  });

  it('lets a higher tier drop a rulebook inherited from a lower tier', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\n    - beta\n');
    await writeLocal('rulebooks:\n  drop:\n    - alpha\n');
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: ['beta'],
      skills: [],
      subagents: [],
      collections: [],
    });
  });

  it('lets a higher tier drop a collection inherited from a lower tier', async () => {
    await writeProject('collections:\n  use:\n    - recommended\n    - other\n');
    await writeLocal('collections:\n  drop:\n    - recommended\n');
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: [],
      skills: [],
      subagents: [],
      collections: ['other'],
    });
  });

  it('discards every type from lower tiers when a higher tier declares root: true', async () => {
    await writeProject(
      'rulebooks:\n  use:\n    - alpha\nskills:\n  use:\n    - one\nsubagents:\n  use:\n    - canary\ncollections:\n  use:\n    - recommended\n',
    );
    await writeLocal(
      'root: true\nrulebooks:\n  use:\n    - beta\nskills:\n  use:\n    - two\nsubagents:\n  use:\n    - other\ncollections:\n  use:\n    - fresh\n',
    );
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: ['beta'],
      skills: ['two'],
      subagents: ['other'],
      collections: ['fresh'],
    });
  });

  it('resolves the project-local tier alone when the project file is absent', async () => {
    await writeLocal('skills:\n  use:\n    - gamma\n');
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: [],
      skills: ['gamma'],
      subagents: [],
      collections: [],
    });
  });

  it('does not read a legacy rulebooks.yaml: it returns undefined when only that file is present', async () => {
    await writeLegacy('rulebooks:\n  - alpha\n');
    expect(await resolveDeclaration({ cwd })).toBeUndefined();
  });
});
