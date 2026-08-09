import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
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

  /** The absolute `.agents/` directory a relative source path resolves against. */
  const agentsDir = (): string => path.join(cwd, '.agents');

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

  it('returns empty type and source lists when a file is present but declares nothing', async () => {
    await writeProject('# nothing declared yet\n');
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: [],
      skills: [],
      subagents: [],
      collections: [],
      packages: [],
      declinedPackages: [],
      sources: [],
      guidanceHooks: new Map(),
    });
  });

  it('resolves additive rulebook use from a single project file, deduplicating', async () => {
    await writeProject('rulebooks:\n  use:\n    - alpha\n    - beta\n    - alpha\n');
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: ['alpha', 'beta'],
      skills: [],
      subagents: [],
      collections: [],
      packages: [],
      declinedPackages: [],
      sources: [],
      guidanceHooks: new Map(),
    });
  });

  it('resolves additive skill use from a single project file, deduplicating', async () => {
    await writeProject('skills:\n  use:\n    - one\n    - two\n    - one\n');
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: [],
      skills: ['one', 'two'],
      subagents: [],
      collections: [],
      packages: [],
      declinedPackages: [],
      sources: [],
      guidanceHooks: new Map(),
    });
  });

  it('resolves additive subagent use from a single project file, deduplicating', async () => {
    await writeProject('subagents:\n  use:\n    - canary\n    - other\n    - canary\n');
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: [],
      skills: [],
      subagents: ['canary', 'other'],
      collections: [],
      packages: [],
      declinedPackages: [],
      sources: [],
      guidanceHooks: new Map(),
    });
  });

  it('resolves additive collection use, leaving expansion of its members to the caller', async () => {
    await writeProject('collections:\n  use:\n    - recommended\n    - other\n    - recommended\n');
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: [],
      skills: [],
      subagents: [],
      collections: ['recommended', 'other'],
      packages: [],
      declinedPackages: [],
      sources: [],
      guidanceHooks: new Map(),
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
      packages: [],
      declinedPackages: [],
      sources: [],
      guidanceHooks: new Map(),
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
      packages: [],
      declinedPackages: [],
      sources: [],
      guidanceHooks: new Map(),
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
      packages: [],
      declinedPackages: [],
      sources: [],
      guidanceHooks: new Map(),
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
      packages: [],
      declinedPackages: [],
      sources: [],
      guidanceHooks: new Map(),
    });
  });

  it('resolves additive package use, deduplicating', async () => {
    await writeProject("packages:\n  use:\n    - '@williamthorsen/nmr'\n    - readyup\n    - '@williamthorsen/nmr'\n");
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: [],
      skills: [],
      subagents: [],
      collections: [],
      packages: ['@williamthorsen/nmr', 'readyup'],
      declinedPackages: [],
      sources: [],
      guidanceHooks: new Map(),
    });
  });

  it('lets a higher tier drop a package inherited from a lower tier, recording it as declined', async () => {
    await writeProject("packages:\n  use:\n    - '@williamthorsen/nmr'\n    - readyup\n");
    await writeLocal("packages:\n  drop:\n    - '@williamthorsen/nmr'\n");
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: [],
      skills: [],
      subagents: [],
      collections: [],
      packages: ['readyup'],
      declinedPackages: ['@williamthorsen/nmr'],
      sources: [],
      guidanceHooks: new Map(),
    });
  });

  it('orders packages highest tier first, matching how sources are ordered', async () => {
    await writeProject("packages:\n  use:\n    - '@acme/base'\n");
    await writeLocal("packages:\n  use:\n    - '@acme/local'\n");

    expect((await resolveDeclaration({ cwd }))?.packages).toEqual(['@acme/local', '@acme/base']);
  });

  it('orders packages declared in one tier last-declared first', async () => {
    await writeProject("packages:\n  use:\n    - '@acme/first'\n    - '@acme/second'\n");

    expect((await resolveDeclaration({ cwd }))?.packages).toEqual(['@acme/second', '@acme/first']);
  });

  it('treats a package re-adopted by a higher tier as adopted rather than declined', async () => {
    await writeProject("packages:\n  drop:\n    - '@acme/pkg'\n");
    await writeLocal("packages:\n  use:\n    - '@acme/pkg'\n");

    const declaration = await resolveDeclaration({ cwd });

    expect(declaration?.packages).toEqual(['@acme/pkg']);
    expect(declaration?.declinedPackages).toEqual([]);
  });

  it('clears declined packages when a higher tier declares root: true', async () => {
    await writeProject("packages:\n  drop:\n    - '@acme/pkg'\n");
    await writeLocal('root: true\n');

    expect((await resolveDeclaration({ cwd }))?.declinedPackages).toEqual([]);
  });

  it('discards every type from lower tiers when a higher tier declares root: true', async () => {
    await writeProject(
      "rulebooks:\n  use:\n    - alpha\nskills:\n  use:\n    - one\nsubagents:\n  use:\n    - canary\ncollections:\n  use:\n    - recommended\npackages:\n  use:\n    - '@acme/old'\n",
    );
    await writeLocal(
      "root: true\nrulebooks:\n  use:\n    - beta\nskills:\n  use:\n    - two\nsubagents:\n  use:\n    - other\ncollections:\n  use:\n    - fresh\npackages:\n  use:\n    - '@acme/new'\n",
    );
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: ['beta'],
      skills: ['two'],
      subagents: ['other'],
      collections: ['fresh'],
      packages: ['@acme/new'],
      declinedPackages: [],
      sources: [],
      guidanceHooks: new Map(),
    });
  });

  it('resolves the project-local tier alone when the project file is absent', async () => {
    await writeLocal('skills:\n  use:\n    - gamma\n');
    expect(await resolveDeclaration({ cwd })).toEqual({
      rulebooks: [],
      skills: ['gamma'],
      subagents: [],
      collections: [],
      packages: [],
      declinedPackages: [],
      sources: [],
      guidanceHooks: new Map(),
    });
  });

  it('does not read a legacy rulebooks.yaml: it returns undefined when only that file is present', async () => {
    await writeLegacy('rulebooks:\n  - alpha\n');
    expect(await resolveDeclaration({ cwd })).toBeUndefined();
  });

  describe('sources', () => {
    it('resolves a relative source path against the declaring file’s .agents/ directory', async () => {
      await writeProject('sources:\n  - name: org\n    path: ../shared-guidance\n');
      const declaration = await resolveDeclaration({ cwd });
      expect(declaration?.sources).toEqual([{ name: 'org', dir: path.resolve(agentsDir(), '../shared-guidance') }]);
    });

    it('keeps an absolute source path unchanged', async () => {
      await writeProject('sources:\n  - name: org\n    path: /opt/guidance\n');
      const declaration = await resolveDeclaration({ cwd });
      expect(declaration?.sources).toEqual([{ name: 'org', dir: '/opt/guidance' }]);
    });

    it('expands a ~-prefixed source path against the home directory', async () => {
      await writeProject('sources:\n  - name: home\n    path: ~/guidance\n');
      const declaration = await resolveDeclaration({ cwd });
      expect(declaration?.sources).toEqual([{ name: 'home', dir: path.join(homedir(), 'guidance') }]);
    });

    it('orders sources highest-precedence-first: later-declared shadows earlier within one file', async () => {
      await writeProject('sources:\n  - name: a\n    path: /a\n  - name: b\n    path: /b\n');
      const declaration = await resolveDeclaration({ cwd });
      expect(declaration?.sources).toEqual([
        { name: 'b', dir: '/b' },
        { name: 'a', dir: '/a' },
      ]);
    });

    it('ranks a higher-tier source above a lower-tier one', async () => {
      await writeProject('sources:\n  - name: org\n    path: /org\n');
      await writeLocal('sources:\n  - name: local\n    path: /local\n');
      const declaration = await resolveDeclaration({ cwd });
      expect(declaration?.sources).toEqual([
        { name: 'local', dir: '/local' },
        { name: 'org', dir: '/org' },
      ]);
    });

    it('remaps a repeated source name to the later path and moves it ahead of an unremapped source', async () => {
      await writeProject('sources:\n  - name: org\n    path: /org-old\n  - name: other\n    path: /other\n');
      await writeLocal('sources:\n  - name: org\n    path: /org-new\n');
      const declaration = await resolveDeclaration({ cwd });
      expect(declaration?.sources).toEqual([
        { name: 'org', dir: '/org-new' },
        { name: 'other', dir: '/other' },
      ]);
    });

    it('discards a lower-tier source declaration when a higher tier declares root: true', async () => {
      await writeProject('sources:\n  - name: org\n    path: /org\n');
      await writeLocal('root: true\nsources:\n  - name: local\n    path: /local\n');
      const declaration = await resolveDeclaration({ cwd });
      expect(declaration?.sources).toEqual([{ name: 'local', dir: '/local' }]);
    });
  });
  describe('guidance-hooks', () => {
    it('accumulates each hook independently, deduplicating within a hook', async () => {
      await writeProject(
        [
          'guidance-hooks:',
          '  implementation-preferences:',
          '    use:',
          '      - layout',
          '      - typescript',
          '      - layout',
          '  project-glossary:',
          '    use:',
          '      - acme-terms',
          '',
        ].join('\n'),
      );
      const declaration = await resolveDeclaration({ cwd });
      expect(declaration?.guidanceHooks).toEqual(
        new Map([
          ['implementation-preferences', ['layout', 'typescript']],
          ['project-glossary', ['acme-terms']],
        ]),
      );
    });

    it('combines bindings for one hook additively across tiers', async () => {
      await writeProject('guidance-hooks:\n  impl:\n    use:\n      - layout\n');
      await writeLocal('guidance-hooks:\n  impl:\n    use:\n      - typescript\n');
      const declaration = await resolveDeclaration({ cwd });
      expect(declaration?.guidanceHooks).toEqual(new Map([['impl', ['layout', 'typescript']]]));
    });

    it('lets a higher tier drop one binding without disturbing the rest of the hook', async () => {
      await writeProject('guidance-hooks:\n  impl:\n    use:\n      - layout\n      - typescript\n');
      await writeLocal('guidance-hooks:\n  impl:\n    drop:\n      - layout\n');
      const declaration = await resolveDeclaration({ cwd });
      expect(declaration?.guidanceHooks).toEqual(new Map([['impl', ['typescript']]]));
    });

    it('omits a hook whose every binding a higher tier dropped', async () => {
      await writeProject('guidance-hooks:\n  impl:\n    use:\n      - layout\n');
      await writeLocal('guidance-hooks:\n  impl:\n    drop:\n      - layout\n');
      const declaration = await resolveDeclaration({ cwd });
      expect(declaration?.guidanceHooks).toEqual(new Map());
    });

    it('leaves a hook a higher tier does not mention untouched', async () => {
      await writeProject('guidance-hooks:\n  impl:\n    use:\n      - layout\n');
      await writeLocal('guidance-hooks:\n  glossary:\n    use:\n      - acme-terms\n');
      const declaration = await resolveDeclaration({ cwd });
      expect(declaration?.guidanceHooks).toEqual(
        new Map([
          ['impl', ['layout']],
          ['glossary', ['acme-terms']],
        ]),
      );
    });

    it('discards lower-tier bindings when a higher tier declares root: true', async () => {
      await writeProject('guidance-hooks:\n  impl:\n    use:\n      - layout\n');
      await writeLocal('root: true\nguidance-hooks:\n  impl:\n    use:\n      - typescript\n');
      const declaration = await resolveDeclaration({ cwd });
      expect(declaration?.guidanceHooks).toEqual(new Map([['impl', ['typescript']]]));
    });
  });
});
