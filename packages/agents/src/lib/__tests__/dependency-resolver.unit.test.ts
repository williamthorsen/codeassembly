import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { artifactFrontmatterPath } from '../artifact-types.ts';
import { createSourceResolver } from '../content-sources.ts';
import { resolveClosure } from '../dependency-resolver.ts';
import {
  buildSingleSourceResolver,
  writeArtifact,
  writeArtifactWithBody,
  writeRawArtifact,
  writeSkillPartial,
  writeSubagent,
} from '../test-utils/resolver-fixtures.ts';

describe(resolveClosure, () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = path.join(tmpdir(), `agents-test-resolver-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(contentDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  it('passes through directly-declared leaf artifacts that do not declare any dependencies', async () => {
    await writeArtifact(contentDir, 'skill', 'people-report');
    await writeArtifact(contentDir, 'subagent', 'canary');

    const closure = await resolveClosure(
      { skill: ['people-report'], subagent: ['canary'] },
      buildSingleSourceResolver(contentDir),
    );

    expect(closure).toEqual({ rulebooks: [], skills: ['people-report'], subagents: ['canary'] });
  });

  it('expands a collection into its members and drops the collection from the result', async () => {
    await writeArtifact(contentDir, 'skill', 'people-report');
    await writeArtifact(contentDir, 'subagent', 'canary');
    await writeArtifact(contentDir, 'collection', 'recommended', { skill: ['people-report'], subagent: ['canary'] });

    const closure = await resolveClosure({ collection: ['recommended'] }, buildSingleSourceResolver(contentDir));

    expect(closure).toEqual({ rulebooks: [], skills: ['people-report'], subagents: ['canary'] });
  });

  it('resolves a collection that depends on another collection transitively', async () => {
    await writeArtifact(contentDir, 'rulebook', 'typescript-conventions');
    await writeArtifact(contentDir, 'skill', 'people-report');
    await writeArtifact(contentDir, 'collection', 'base', { rulebook: ['typescript-conventions'] });
    await writeArtifact(contentDir, 'collection', 'recommended', { collection: ['base'], skill: ['people-report'] });

    const closure = await resolveClosure({ collection: ['recommended'] }, buildSingleSourceResolver(contentDir));

    expect(closure).toEqual({ rulebooks: ['typescript-conventions'], skills: ['people-report'], subagents: [] });
  });

  it('deduplicates a diamond dependency so that each member appears once', async () => {
    await writeArtifact(contentDir, 'skill', 'shared');
    await writeArtifact(contentDir, 'collection', 'left', { skill: ['shared'] });
    await writeArtifact(contentDir, 'collection', 'right', { skill: ['shared'] });
    await writeArtifact(contentDir, 'collection', 'top', { collection: ['left', 'right'] });

    const closure = await resolveClosure({ collection: ['top'] }, buildSingleSourceResolver(contentDir));

    expect(closure.skills).toEqual(['shared']);
  });

  it('follows a dependency edge declared by a non-collection artifact', async () => {
    await writeArtifact(contentDir, 'rulebook', 'typescript-conventions');
    await writeArtifact(contentDir, 'skill', 'people-report', { rulebook: ['typescript-conventions'] });

    const closure = await resolveClosure({ skill: ['people-report'] }, buildSingleSourceResolver(contentDir));

    expect(closure).toEqual({ rulebooks: ['typescript-conventions'], skills: ['people-report'], subagents: [] });
  });

  it('throws naming the cycle when dependencies form a loop', async () => {
    await writeArtifact(contentDir, 'collection', 'a', { collection: ['b'] });
    await writeArtifact(contentDir, 'collection', 'b', { collection: ['a'] });

    await expect(resolveClosure({ collection: ['a'] }, buildSingleSourceResolver(contentDir))).rejects.toThrow(
      /cycle.*collection:a → collection:b → collection:a/s,
    );
  });

  it('throws naming the missing member and the collection that named it', async () => {
    await writeArtifact(contentDir, 'collection', 'recommended', { skill: ['ghost'] });

    await expect(
      resolveClosure({ collection: ['recommended'] }, buildSingleSourceResolver(contentDir)),
    ).rejects.toThrow(/skill "ghost", named by collection:recommended, was not found/);
  });

  it('throws naming the artifact whose dependencies edge named the missing slug', async () => {
    await writeArtifact(contentDir, 'skill', 'wrap-up', { rulebook: ['ghost'] });

    await expect(resolveClosure({ skill: ['wrap-up'] }, buildSingleSourceResolver(contentDir))).rejects.toThrow(
      /rulebook "ghost", named by skill:wrap-up, was not found/,
    );
  });

  it('throws without a referrer when the missing slug is a seed', async () => {
    await expect(resolveClosure({ rulebook: ['ghost'] }, buildSingleSourceResolver(contentDir))).rejects.toThrow(
      /^Referenced rulebook "ghost" was not found in any of: /,
    );
  });

  it('resolves a collection whose members is @library to the full deployable catalog', async () => {
    await writeArtifact(contentDir, 'rulebook', 'typescript-conventions');
    await writeArtifact(contentDir, 'skill', 'people-report');
    await writeArtifact(contentDir, 'subagent', 'canary');
    await writeArtifact(contentDir, 'collection', 'all', '@library');

    const closure = await resolveClosure({ collection: ['all'] }, buildSingleSourceResolver(contentDir));

    expect(closure.rulebooks.toSorted()).toEqual(['typescript-conventions']);
    expect(closure.skills.toSorted()).toEqual(['people-report']);
    expect(closure.subagents.toSorted()).toEqual(['canary']);
  });

  it('includes a newly added artifact in @library without an edit to the collection', async () => {
    await writeArtifact(contentDir, 'skill', 'people-report');
    await writeArtifact(contentDir, 'collection', 'all', '@library');

    const before = await resolveClosure({ collection: ['all'] }, buildSingleSourceResolver(contentDir));
    expect(before.skills.toSorted()).toEqual(['people-report']);

    await writeArtifact(contentDir, 'skill', 'classify-complexity');
    const after = await resolveClosure({ collection: ['all'] }, buildSingleSourceResolver(contentDir));

    expect(after.skills.toSorted()).toEqual(['classify-complexity', 'people-report']);
  });

  it('deduplicates @library pulled by two collections under one parent', async () => {
    await writeArtifact(contentDir, 'skill', 'shared');
    await writeArtifact(contentDir, 'collection', 'left', '@library');
    await writeArtifact(contentDir, 'collection', 'right', '@library');
    await writeArtifact(contentDir, 'collection', 'top', { collection: ['left', 'right'] });

    const closure = await resolveClosure({ collection: ['top'] }, buildSingleSourceResolver(contentDir));

    expect(closure.skills).toEqual(['shared']);
  });

  it('resolves an @unclaimed collection to the artifacts that no disposition claims', async () => {
    await writeArtifact(contentDir, 'skill', 'vetted');
    await writeArtifact(contentDir, 'skill', 'bundled');
    await writeArtifact(contentDir, 'skill', 'unexamined');
    await writeRawArtifact(contentDir, 'subagent', 'proof', 'standalone: exercises a mechanism');
    await writeRawArtifact(
      contentDir,
      'collection',
      'recommended',
      'disposition: public\nmembers:\n  skills:\n    - vetted',
    );
    await writeArtifact(contentDir, 'collection', 'bundle', { skill: ['bundled'] });
    await writeRawArtifact(contentDir, 'collection', 'triage', "members: '@unclaimed'");

    const closure = await resolveClosure({ collection: ['triage'] }, buildSingleSourceResolver(contentDir));

    expect(closure.skills.toSorted()).toEqual(['bundled', 'unexamined']);
    expect(closure.subagents).toEqual([]);
  });

  it('refuses to expand @unclaimed while a claim in the root is unreadable, naming its file', async () => {
    await writeArtifact(contentDir, 'skill', 'unexamined');
    await writeRawArtifact(contentDir, 'skill', 'proof', "standalone: ''");
    await writeRawArtifact(contentDir, 'collection', 'triage', "members: '@unclaimed'");

    await expect(resolveClosure({ collection: ['triage'] }, buildSingleSourceResolver(contentDir))).rejects.toThrow(
      /skills\/proof\/SKILL\.md/,
    );
  });

  it('throws naming the collection on an unrecognized members token', async () => {
    const filePath = path.join(contentDir, artifactFrontmatterPath('collection', 'bad'));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "---\nname: bad\nmembers: '@everything'\n---\n\n# bad\n", 'utf8');

    await expect(resolveClosure({ collection: ['bad'] }, buildSingleSourceResolver(contentDir))).rejects.toThrow(
      /collection bad.*@everything/s,
    );
  });

  it("pulls a subagent's injected skills into the closure without a dependencies edge", async () => {
    await writeArtifact(contentDir, 'skill', 'anti-patterns');
    await writeSubagent(contentDir, 'orchestrated-coder', ['anti-patterns']);

    const closure = await resolveClosure({ subagent: ['orchestrated-coder'] }, buildSingleSourceResolver(contentDir));

    expect(closure).toEqual({ rulebooks: [], skills: ['anti-patterns'], subagents: ['orchestrated-coder'] });
  });

  it('pulls injected skills into the closure for a subagent reached transitively', async () => {
    await writeArtifact(contentDir, 'skill', 'anti-patterns');
    await writeSubagent(contentDir, 'orchestrated-coder', ['anti-patterns']);
    await writeArtifact(contentDir, 'collection', 'recommended', { subagent: ['orchestrated-coder'] });

    const closure = await resolveClosure({ collection: ['recommended'] }, buildSingleSourceResolver(contentDir));

    expect(closure.skills).toEqual(['anti-patterns']);
    expect(closure.subagents).toEqual(['orchestrated-coder']);
  });

  it('deduplicates a skill named in both the injection list and the dependencies edge', async () => {
    await writeArtifact(contentDir, 'skill', 'anti-patterns');
    await writeSubagent(contentDir, 'orchestrated-coder', ['anti-patterns'], { skill: ['anti-patterns'] });

    const closure = await resolveClosure({ subagent: ['orchestrated-coder'] }, buildSingleSourceResolver(contentDir));

    expect(closure.skills).toEqual(['anti-patterns']);
  });

  it('throws naming the cycle when an injected skill loops back to the subagent', async () => {
    await writeArtifact(contentDir, 'skill', 'loops', { subagent: ['coder'] });
    await writeSubagent(contentDir, 'coder', ['loops']);

    await expect(resolveClosure({ subagent: ['coder'] }, buildSingleSourceResolver(contentDir))).rejects.toThrow(
      /cycle.*subagent:coder → skill:loops → subagent:coder/s,
    );
  });

  it('throws naming the skill and the subagent that injected it when an injected skill is missing', async () => {
    await writeSubagent(contentDir, 'orchestrated-coder', ['ghost']);

    await expect(
      resolveClosure({ subagent: ['orchestrated-coder'] }, buildSingleSourceResolver(contentDir)),
    ).rejects.toThrow(/skill "ghost", named by subagent:orchestrated-coder, was not found/);
  });

  describe('optional body tokens', () => {
    it('keeps an optional skill token out of the closure', async () => {
      await writeArtifact(contentDir, 'skill', 'create-bitbucket-pr');
      await writeArtifactWithBody(contentDir, 'skill', 'create-pr', 'Delegate to {skill?:create-bitbucket-pr}.');

      const closure = await resolveClosure({ skill: ['create-pr'] }, buildSingleSourceResolver(contentDir));

      expect(closure).toEqual({ rulebooks: [], skills: ['create-pr'], subagents: [] });
    });

    it('keeps an optional subagent token out of the closure', async () => {
      await writeArtifact(contentDir, 'subagent', 'planner');
      await writeArtifactWithBody(contentDir, 'skill', 'plan', 'Dispatch {subagent?:planner}.');

      const closure = await resolveClosure({ skill: ['plan'] }, buildSingleSourceResolver(contentDir));

      expect(closure).toEqual({ rulebooks: [], skills: ['plan'], subagents: [] });
    });

    it('keeps the optional target’s own dependencies out of the closure', async () => {
      await writeArtifact(contentDir, 'rulebook', 'jira-conventions');
      await writeArtifact(contentDir, 'skill', 'update-jira-ticket', { rulebook: ['jira-conventions'] });
      await writeArtifactWithBody(contentDir, 'skill', 'create-ticket', 'Write per {skill?:update-jira-ticket}.');

      const closure = await resolveClosure({ skill: ['create-ticket'] }, buildSingleSourceResolver(contentDir));

      expect(closure).toEqual({ rulebooks: [], skills: ['create-ticket'], subagents: [] });
    });

    it('keeps an optional token from closing a cycle that its required form would close', async () => {
      await writeArtifactWithBody(contentDir, 'skill', 'alpha', 'See {skill?:beta}.');
      await writeArtifactWithBody(contentDir, 'skill', 'beta', 'See {skill:alpha}.');

      const closure = await resolveClosure({ skill: ['alpha'] }, buildSingleSourceResolver(contentDir));

      expect(closure.skills).toEqual(['alpha']);
    });

    it.each([
      { kind: 'skill' as const, body: 'Delegate to {skill?:ghost}.' },
      { kind: 'subagent' as const, body: 'Dispatch {subagent?:ghost}.' },
    ])('fails the run when an optional $kind token names a non-existent artifact', async ({ kind, body }) => {
      await writeArtifactWithBody(contentDir, 'skill', 'create-pr', body);

      await expect(resolveClosure({ skill: ['create-pr'] }, buildSingleSourceResolver(contentDir))).rejects.toThrow(
        new RegExp(`Optional ${kind} "ghost", named by skill:create-pr, was not found`),
      );
    });

    it('resolves an optional token in a rulebook body', async () => {
      await writeArtifactWithBody(contentDir, 'rulebook', 'some-rulebook', 'Invoke {skill?:ghost}.');

      await expect(
        resolveClosure({ rulebook: ['some-rulebook'] }, buildSingleSourceResolver(contentDir)),
      ).rejects.toThrow(/Optional skill "ghost", named by rulebook:some-rulebook, was not found/);
    });
  });

  describe('resolving through declared sources', () => {
    let sourceDir: string;

    beforeEach(async () => {
      sourceDir = path.join(tmpdir(), `agents-test-resolver-src-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await mkdir(sourceDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(sourceDir, { recursive: true, force: true });
    });

    it('resolves a source rulebook and its closure edges from the source over a lower-precedence source', async () => {
      await writeArtifact(contentDir, 'rulebook', 'library-dep');
      await writeArtifact(sourceDir, 'rulebook', 'source-dep');
      await writeArtifact(sourceDir, 'rulebook', 'source-book', {
        rulebook: ['source-dep', 'library-dep'],
      });
      const resolver = createSourceResolver([
        { name: 'org', dir: sourceDir },
        { name: 'codeassembly', dir: contentDir },
      ]);

      const closure = await resolveClosure({ rulebook: ['source-book'] }, resolver);

      expect(closure.rulebooks.toSorted()).toEqual(['library-dep', 'source-book', 'source-dep']);
    });

    it('throws naming every searched location when a slug does not resolve from any declared source', async () => {
      const resolver = createSourceResolver([
        { name: 'org', dir: sourceDir },
        { name: 'codeassembly', dir: contentDir },
      ]);

      const searched = resolveClosure({ rulebook: ['ghost'] }, resolver);

      await expect(searched).rejects.toThrow(/rulebook "ghost" was not found/);
      await expect(searched).rejects.toThrow(new RegExp(path.join(sourceDir, 'guidance', 'rulebooks', 'ghost.md')));
      await expect(searched).rejects.toThrow(new RegExp(path.join(contentDir, 'guidance', 'rulebooks', 'ghost.md')));
    });

    it('resolves a source skill, expanding its body against the source root to find an edge to a skill in a lower source', async () => {
      await writeSkillPartial(sourceDir, 'source-skill', 'frag.md', 'Invoke {skill:library-helper}.');
      await writeArtifactWithBody(sourceDir, 'skill', 'source-skill', '<!-- include: _partials/frag.md / -->');
      await writeArtifact(contentDir, 'skill', 'library-helper');
      const resolver = createSourceResolver([
        { name: 'org', dir: sourceDir },
        { name: 'codeassembly', dir: contentDir },
      ]);

      const closure = await resolveClosure({ skill: ['source-skill'] }, resolver);

      expect(closure.skills.toSorted()).toEqual(['library-helper', 'source-skill']);
    });

    it('resolves a source subagent from its source', async () => {
      await writeSubagent(sourceDir, 'source-agent', []);
      const resolver = createSourceResolver([
        { name: 'org', dir: sourceDir },
        { name: 'codeassembly', dir: contentDir },
      ]);

      const closure = await resolveClosure({ subagent: ['source-agent'] }, resolver);

      expect(closure.subagents).toEqual(['source-agent']);
    });

    it('expands a source collection with explicit members, resolving each member source-first', async () => {
      await writeArtifact(sourceDir, 'skill', 'source-skill');
      await writeArtifact(contentDir, 'rulebook', 'library-rule');
      await writeArtifact(sourceDir, 'collection', 'source-collection', {
        rulebook: ['library-rule'],
        skill: ['source-skill'],
      });
      const resolver = createSourceResolver([
        { name: 'org', dir: sourceDir },
        { name: 'codeassembly', dir: contentDir },
      ]);

      const closure = await resolveClosure({ collection: ['source-collection'] }, resolver);

      expect(closure.skills).toEqual(['source-skill']);
      expect(closure.rulebooks).toEqual(['library-rule']);
    });

    it('enumerates the source catalog for a source collection whose members is @library', async () => {
      await writeArtifact(sourceDir, 'skill', 'source-only-skill');
      await writeArtifact(sourceDir, 'subagent', 'source-only-agent');
      await writeArtifact(contentDir, 'skill', 'library-only-skill');
      await writeArtifact(sourceDir, 'collection', 'source-all', '@library');
      const resolver = createSourceResolver([
        { name: 'org', dir: sourceDir },
        { name: 'codeassembly', dir: contentDir },
      ]);

      const closure = await resolveClosure({ collection: ['source-all'] }, resolver);

      expect(closure.skills.toSorted()).toEqual(['source-only-skill']);
      expect(closure.subagents.toSorted()).toEqual(['source-only-agent']);
      expect(closure.skills).not.toContain('library-only-skill');
    });

    it("enumerates only the lower source's catalog for its own @library collection", async () => {
      await writeArtifact(contentDir, 'skill', 'library-skill');
      await writeArtifact(sourceDir, 'skill', 'source-skill');
      await writeArtifact(contentDir, 'collection', 'library-all', '@library');
      const resolver = createSourceResolver([
        { name: 'org', dir: sourceDir },
        { name: 'codeassembly', dir: contentDir },
      ]);

      const closure = await resolveClosure({ collection: ['library-all'] }, resolver);

      expect(closure.skills.toSorted()).toEqual(['library-skill']);
      expect(closure.skills).not.toContain('source-skill');
    });

    it("resolves a lower source's collection through a resolver that also includes a higher source", async () => {
      await writeArtifact(contentDir, 'skill', 'library-skill');
      await writeArtifact(contentDir, 'collection', 'library-collection', { skill: ['library-skill'] });
      const resolver = createSourceResolver([
        { name: 'org', dir: sourceDir },
        { name: 'codeassembly', dir: contentDir },
      ]);

      const closure = await resolveClosure({ collection: ['library-collection'] }, resolver);

      expect(closure.skills).toEqual(['library-skill']);
    });

    it("resolves a lower source's skill through a resolver that also includes a higher source", async () => {
      await writeArtifact(contentDir, 'skill', 'library-skill');
      const resolver = createSourceResolver([
        { name: 'org', dir: sourceDir },
        { name: 'codeassembly', dir: contentDir },
      ]);

      const closure = await resolveClosure({ skill: ['library-skill'] }, resolver);

      expect(closure.skills).toEqual(['library-skill']);
    });
  });
});
