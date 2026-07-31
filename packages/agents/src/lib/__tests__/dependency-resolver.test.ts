import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ARTIFACT_TYPE_VALUES, ARTIFACT_TYPES, artifactFrontmatterPath, type ArtifactType } from '../artifact-types.ts';
import { createSourceResolver, libraryResolver } from '../content-sources.ts';
import { type DirectArtifacts, resolveClosure } from '../dependency-resolver.ts';

describe(resolveClosure, () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = path.join(tmpdir(), `agents-test-resolver-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(contentDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  it('passes through directly-declared leaf artifacts that declare no dependencies', async () => {
    await writeArtifact(contentDir, 'skill', 'people-report');
    await writeArtifact(contentDir, 'subagent', 'canary');

    const closure = await resolveClosure(
      { skill: ['people-report'], subagent: ['canary'] },
      libraryResolver(contentDir),
    );

    expect(closure).toEqual({ rulebooks: [], skills: ['people-report'], subagents: ['canary'] });
  });

  it('expands a collection into its members and drops the collection from the result', async () => {
    await writeArtifact(contentDir, 'skill', 'people-report');
    await writeArtifact(contentDir, 'subagent', 'canary');
    await writeArtifact(contentDir, 'collection', 'recommended', { skill: ['people-report'], subagent: ['canary'] });

    const closure = await resolveClosure({ collection: ['recommended'] }, libraryResolver(contentDir));

    expect(closure).toEqual({ rulebooks: [], skills: ['people-report'], subagents: ['canary'] });
  });

  it('resolves a collection that depends on another collection transitively', async () => {
    await writeArtifact(contentDir, 'rulebook', 'typescript-conventions');
    await writeArtifact(contentDir, 'skill', 'people-report');
    await writeArtifact(contentDir, 'collection', 'base', { rulebook: ['typescript-conventions'] });
    await writeArtifact(contentDir, 'collection', 'recommended', { collection: ['base'], skill: ['people-report'] });

    const closure = await resolveClosure({ collection: ['recommended'] }, libraryResolver(contentDir));

    expect(closure).toEqual({ rulebooks: ['typescript-conventions'], skills: ['people-report'], subagents: [] });
  });

  it('deduplicates a diamond dependency so each member appears once', async () => {
    await writeArtifact(contentDir, 'skill', 'shared');
    await writeArtifact(contentDir, 'collection', 'left', { skill: ['shared'] });
    await writeArtifact(contentDir, 'collection', 'right', { skill: ['shared'] });
    await writeArtifact(contentDir, 'collection', 'top', { collection: ['left', 'right'] });

    const closure = await resolveClosure({ collection: ['top'] }, libraryResolver(contentDir));

    expect(closure.skills).toEqual(['shared']);
  });

  it('follows a dependency edge declared by a non-collection artifact', async () => {
    await writeArtifact(contentDir, 'rulebook', 'typescript-conventions');
    await writeArtifact(contentDir, 'skill', 'people-report', { rulebook: ['typescript-conventions'] });

    const closure = await resolveClosure({ skill: ['people-report'] }, libraryResolver(contentDir));

    expect(closure).toEqual({ rulebooks: ['typescript-conventions'], skills: ['people-report'], subagents: [] });
  });

  it('throws naming the cycle when dependencies form a loop', async () => {
    await writeArtifact(contentDir, 'collection', 'a', { collection: ['b'] });
    await writeArtifact(contentDir, 'collection', 'b', { collection: ['a'] });

    await expect(resolveClosure({ collection: ['a'] }, libraryResolver(contentDir))).rejects.toThrow(
      /cycle.*collection:a → collection:b → collection:a/s,
    );
  });

  it('throws naming the type and slug when a referenced artifact is missing', async () => {
    await writeArtifact(contentDir, 'collection', 'recommended', { skill: ['ghost'] });

    await expect(resolveClosure({ collection: ['recommended'] }, libraryResolver(contentDir))).rejects.toThrow(
      /skill "ghost" was not found/,
    );
  });

  it('resolves a collection whose members is @library to the full deployable catalog', async () => {
    await writeArtifact(contentDir, 'rulebook', 'typescript-conventions');
    await writeArtifact(contentDir, 'skill', 'people-report');
    await writeArtifact(contentDir, 'subagent', 'canary');
    await writeArtifact(contentDir, 'collection', 'all', '@library');

    const closure = await resolveClosure({ collection: ['all'] }, libraryResolver(contentDir));

    expect(closure.rulebooks.toSorted()).toEqual(['typescript-conventions']);
    expect(closure.skills.toSorted()).toEqual(['people-report']);
    expect(closure.subagents.toSorted()).toEqual(['canary']);
  });

  it('includes a newly added artifact in @library with no edit to the collection', async () => {
    await writeArtifact(contentDir, 'skill', 'people-report');
    await writeArtifact(contentDir, 'collection', 'all', '@library');

    const before = await resolveClosure({ collection: ['all'] }, libraryResolver(contentDir));
    expect(before.skills.toSorted()).toEqual(['people-report']);

    await writeArtifact(contentDir, 'skill', 'classify-complexity');
    const after = await resolveClosure({ collection: ['all'] }, libraryResolver(contentDir));

    expect(after.skills.toSorted()).toEqual(['classify-complexity', 'people-report']);
  });

  it('deduplicates @library pulled by two collections under one parent', async () => {
    await writeArtifact(contentDir, 'skill', 'shared');
    await writeArtifact(contentDir, 'collection', 'left', '@library');
    await writeArtifact(contentDir, 'collection', 'right', '@library');
    await writeArtifact(contentDir, 'collection', 'top', { collection: ['left', 'right'] });

    const closure = await resolveClosure({ collection: ['top'] }, libraryResolver(contentDir));

    expect(closure.skills).toEqual(['shared']);
  });

  it('throws naming the collection on an unrecognized members token', async () => {
    const filePath = path.join(contentDir, artifactFrontmatterPath('collection', 'bad'));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "---\nname: bad\nmembers: '@everything'\n---\n\n# bad\n", 'utf8');

    await expect(resolveClosure({ collection: ['bad'] }, libraryResolver(contentDir))).rejects.toThrow(
      /collection bad.*@everything/s,
    );
  });

  it("pulls a subagent's injected skills into the closure without a dependencies edge", async () => {
    await writeArtifact(contentDir, 'skill', 'anti-patterns');
    await writeSubagent(contentDir, 'orchestrated-coder', ['anti-patterns']);

    const closure = await resolveClosure({ subagent: ['orchestrated-coder'] }, libraryResolver(contentDir));

    expect(closure).toEqual({ rulebooks: [], skills: ['anti-patterns'], subagents: ['orchestrated-coder'] });
  });

  it('pulls injected skills into the closure for a subagent reached transitively', async () => {
    await writeArtifact(contentDir, 'skill', 'anti-patterns');
    await writeSubagent(contentDir, 'orchestrated-coder', ['anti-patterns']);
    await writeArtifact(contentDir, 'collection', 'recommended', { subagent: ['orchestrated-coder'] });

    const closure = await resolveClosure({ collection: ['recommended'] }, libraryResolver(contentDir));

    expect(closure.skills).toEqual(['anti-patterns']);
    expect(closure.subagents).toEqual(['orchestrated-coder']);
  });

  it('deduplicates a skill named in both the injection list and the dependencies edge', async () => {
    await writeArtifact(contentDir, 'skill', 'anti-patterns');
    await writeSubagent(contentDir, 'orchestrated-coder', ['anti-patterns'], { skill: ['anti-patterns'] });

    const closure = await resolveClosure({ subagent: ['orchestrated-coder'] }, libraryResolver(contentDir));

    expect(closure.skills).toEqual(['anti-patterns']);
  });

  it('throws naming the cycle when an injected skill loops back to the subagent', async () => {
    await writeArtifact(contentDir, 'skill', 'loops', { subagent: ['coder'] });
    await writeSubagent(contentDir, 'coder', ['loops']);

    await expect(resolveClosure({ subagent: ['coder'] }, libraryResolver(contentDir))).rejects.toThrow(
      /cycle.*subagent:coder → skill:loops → subagent:coder/s,
    );
  });

  it('throws naming the skill when an injected skill is missing from the library', async () => {
    await writeSubagent(contentDir, 'orchestrated-coder', ['ghost']);

    await expect(resolveClosure({ subagent: ['orchestrated-coder'] }, libraryResolver(contentDir))).rejects.toThrow(
      /skill "ghost" was not found/,
    );
  });

  describe('body invocation tokens', () => {
    it('pulls a skill body invocation token into the closure', async () => {
      await writeArtifact(contentDir, 'skill', 'capture-event');
      await writeArtifactWithBody(contentDir, 'skill', 'wrap-up', 'Invoke {skill:capture-event} to record it.');

      const closure = await resolveClosure({ skill: ['wrap-up'] }, libraryResolver(contentDir));

      expect(closure.skills.toSorted()).toEqual(['capture-event', 'wrap-up']);
    });

    it('pulls a subagent body invocation token into the closure', async () => {
      await writeArtifact(contentDir, 'subagent', 'planner');
      await writeArtifactWithBody(contentDir, 'subagent', 'orchestrator', 'Dispatch {subagent:planner} first.');

      const closure = await resolveClosure({ subagent: ['orchestrator'] }, libraryResolver(contentDir));

      expect(closure.subagents.toSorted()).toEqual(['orchestrator', 'planner']);
    });

    it('pulls a token that arrives via an included partial into the closure', async () => {
      await writeArtifact(contentDir, 'skill', 'capture-event');
      await writeSkillPartial(contentDir, 'wrap-up', 'frag.md', 'Then invoke {skill:capture-event}.');
      await writeArtifactWithBody(contentDir, 'skill', 'wrap-up', '# wrap-up\n\n<!-- include: _partials/frag.md / -->');

      const closure = await resolveClosure({ skill: ['wrap-up'] }, libraryResolver(contentDir));

      expect(closure.skills.toSorted()).toEqual(['capture-event', 'wrap-up']);
    });

    it('fails the run when a body token names a non-existent artifact', async () => {
      await writeArtifactWithBody(contentDir, 'skill', 'wrap-up', 'Invoke {skill:ghost}.');

      await expect(resolveClosure({ skill: ['wrap-up'] }, libraryResolver(contentDir))).rejects.toThrow(
        /skill "ghost" was not found/,
      );
    });

    it('deduplicates a slug named by both a body token and a dependencies edge', async () => {
      await writeArtifact(contentDir, 'skill', 'capture-event');
      await writeArtifactWithBody(contentDir, 'skill', 'wrap-up', 'Invoke {skill:capture-event}.', {
        skill: ['capture-event'],
      });

      const closure = await resolveClosure({ skill: ['wrap-up'] }, libraryResolver(contentDir));

      expect(closure.skills.toSorted()).toEqual(['capture-event', 'wrap-up']);
    });

    it('pulls a skill named by a rulebook body token into the closure', async () => {
      await writeArtifact(contentDir, 'skill', 'capture-event');
      await writeArtifactWithBody(contentDir, 'rulebook', 'some-rulebook', 'Invoke {skill:capture-event}.');

      const closure = await resolveClosure({ rulebook: ['some-rulebook'] }, libraryResolver(contentDir));

      expect(closure).toEqual({ rulebooks: ['some-rulebook'], skills: ['capture-event'], subagents: [] });
    });

    it('pulls a subagent named by a rulebook body token into the closure', async () => {
      await writeArtifact(contentDir, 'subagent', 'planner');
      await writeArtifactWithBody(contentDir, 'rulebook', 'some-rulebook', 'Dispatch {subagent:planner}.');

      const closure = await resolveClosure({ rulebook: ['some-rulebook'] }, libraryResolver(contentDir));

      expect(closure).toEqual({ rulebooks: ['some-rulebook'], skills: [], subagents: ['planner'] });
    });

    it('pulls a rulebook named by a rulebook body token into the closure', async () => {
      await writeArtifact(contentDir, 'rulebook', 'nmr-scripts');
      await writeArtifactWithBody(contentDir, 'rulebook', 'nmr-cheatsheet', 'See {rulebook:nmr-scripts}.');

      const closure = await resolveClosure({ rulebook: ['nmr-cheatsheet'] }, libraryResolver(contentDir));

      expect(closure.rulebooks.toSorted()).toEqual(['nmr-cheatsheet', 'nmr-scripts']);
    });

    it('drops a rulebook body self-token so a self-reference renders without becoming an edge', async () => {
      await writeArtifactWithBody(contentDir, 'rulebook', 'nmr-scripts', 'Re-read {rulebook:nmr-scripts} for detail.');

      const closure = await resolveClosure({ rulebook: ['nmr-scripts'] }, libraryResolver(contentDir));

      expect(closure.rulebooks).toEqual(['nmr-scripts']);
    });

    it('leaves a rulebook token in a skill body out of the closure', async () => {
      // Only a rulebook body renders a rulebook token, so unioning one here would deploy a target for a reference the
      // render pass rejects. The named rulebook is not existence-checked either: it does not exist, and this resolves.
      await writeArtifactWithBody(contentDir, 'skill', 'wrap-up', 'See {rulebook:nmr-scripts}.');

      const closure = await resolveClosure({ skill: ['wrap-up'] }, libraryResolver(contentDir));

      expect(closure).toEqual({ rulebooks: [], skills: ['wrap-up'], subagents: [] });
    });

    it('drops a skill body self-token so a self-reference renders without becoming an edge', async () => {
      await writeArtifactWithBody(
        contentDir,
        'skill',
        'capture-feedback',
        'Invoke {skill:capture-feedback} on feedback.',
      );

      const closure = await resolveClosure({ skill: ['capture-feedback'] }, libraryResolver(contentDir));

      expect(closure.skills).toEqual(['capture-feedback']);
    });

    it('drops a subagent body self-token so a self-reference renders without becoming an edge', async () => {
      await writeArtifactWithBody(contentDir, 'subagent', 'planner', 'Re-dispatch {subagent:planner} to continue.');

      const closure = await resolveClosure({ subagent: ['planner'] }, libraryResolver(contentDir));

      expect(closure.subagents).toEqual(['planner']);
    });

    it('still throws on a genuine cycle formed by body tokens', async () => {
      await writeArtifactWithBody(contentDir, 'skill', 'alpha', 'See {skill:beta}.');
      await writeArtifactWithBody(contentDir, 'skill', 'beta', 'See {skill:alpha}.');

      await expect(resolveClosure({ skill: ['alpha'] }, libraryResolver(contentDir))).rejects.toThrow(
        /cycle.*skill:alpha → skill:beta → skill:alpha/s,
      );
    });

    it('still throws on a self-dependency declared in frontmatter', async () => {
      await writeArtifactWithBody(contentDir, 'skill', 'selfdep', '# selfdep', { skill: ['selfdep'] });

      await expect(resolveClosure({ skill: ['selfdep'] }, libraryResolver(contentDir))).rejects.toThrow(
        /cycle.*skill:selfdep → skill:selfdep/s,
      );
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

    it('resolves a source rulebook and its closure edges from the source over the library', async () => {
      await writeArtifact(contentDir, 'rulebook', 'library-dep');
      await writeArtifact(sourceDir, 'rulebook', 'source-dep');
      await writeArtifact(sourceDir, 'rulebook', 'source-book', {
        rulebook: ['source-dep', 'library-dep'],
      });
      const resolver = createSourceResolver([{ name: 'org', dir: sourceDir }], contentDir);

      const closure = await resolveClosure({ rulebook: ['source-book'] }, resolver);

      expect(closure.rulebooks.toSorted()).toEqual(['library-dep', 'source-book', 'source-dep']);
    });

    it('throws naming every searched location when a slug resolves from no source or the library', async () => {
      const resolver = createSourceResolver([{ name: 'org', dir: sourceDir }], contentDir);

      const searched = resolveClosure({ rulebook: ['ghost'] }, resolver);

      await expect(searched).rejects.toThrow(/rulebook "ghost" was not found/);
      await expect(searched).rejects.toThrow(new RegExp(path.join(sourceDir, 'guidance', 'rulebooks', 'ghost.md')));
      await expect(searched).rejects.toThrow(new RegExp(path.join(contentDir, 'guidance', 'rulebooks', 'ghost.md')));
    });

    it('resolves a source skill, expanding its body against the source root to reach a library-provided edge', async () => {
      await writeSkillPartial(sourceDir, 'source-skill', 'frag.md', 'Invoke {skill:library-helper}.');
      await writeArtifactWithBody(sourceDir, 'skill', 'source-skill', '<!-- include: _partials/frag.md / -->');
      await writeArtifact(contentDir, 'skill', 'library-helper');
      const resolver = createSourceResolver([{ name: 'org', dir: sourceDir }], contentDir);

      const closure = await resolveClosure({ skill: ['source-skill'] }, resolver);

      expect(closure.skills.toSorted()).toEqual(['library-helper', 'source-skill']);
    });

    it('resolves a source subagent from its source', async () => {
      await writeSubagent(sourceDir, 'source-agent', []);
      const resolver = createSourceResolver([{ name: 'org', dir: sourceDir }], contentDir);

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
      const resolver = createSourceResolver([{ name: 'org', dir: sourceDir }], contentDir);

      const closure = await resolveClosure({ collection: ['source-collection'] }, resolver);

      expect(closure.skills).toEqual(['source-skill']);
      expect(closure.rulebooks).toEqual(['library-rule']);
    });

    it('enumerates the source catalog for a source collection whose members is @library', async () => {
      await writeArtifact(sourceDir, 'skill', 'source-only-skill');
      await writeArtifact(sourceDir, 'subagent', 'source-only-agent');
      await writeArtifact(contentDir, 'skill', 'library-only-skill');
      await writeArtifact(sourceDir, 'collection', 'source-all', '@library');
      const resolver = createSourceResolver([{ name: 'org', dir: sourceDir }], contentDir);

      const closure = await resolveClosure({ collection: ['source-all'] }, resolver);

      expect(closure.skills.toSorted()).toEqual(['source-only-skill']);
      expect(closure.subagents.toSorted()).toEqual(['source-only-agent']);
      expect(closure.skills).not.toContain('library-only-skill');
    });

    it('still enumerates only the built-in catalog for a library @library collection when sources are declared', async () => {
      await writeArtifact(contentDir, 'skill', 'library-skill');
      await writeArtifact(sourceDir, 'skill', 'source-skill');
      await writeArtifact(contentDir, 'collection', 'library-all', '@library');
      const resolver = createSourceResolver([{ name: 'org', dir: sourceDir }], contentDir);

      const closure = await resolveClosure({ collection: ['library-all'] }, resolver);

      expect(closure.skills.toSorted()).toEqual(['library-skill']);
      expect(closure.skills).not.toContain('source-skill');
    });

    it('still resolves a library collection through a resolver that also carries declared sources', async () => {
      await writeArtifact(contentDir, 'skill', 'library-skill');
      await writeArtifact(contentDir, 'collection', 'library-collection', { skill: ['library-skill'] });
      const resolver = createSourceResolver([{ name: 'org', dir: sourceDir }], contentDir);

      const closure = await resolveClosure({ collection: ['library-collection'] }, resolver);

      expect(closure.skills).toEqual(['library-skill']);
    });

    it('still deploys a library skill through a resolver that also carries declared sources', async () => {
      await writeArtifact(contentDir, 'skill', 'library-skill');
      const resolver = createSourceResolver([{ name: 'org', dir: sourceDir }], contentDir);

      const closure = await resolveClosure({ skill: ['library-skill'] }, resolver);

      expect(closure.skills).toEqual(['library-skill']);
    });
  });
});

/**
 * Writes an artifact's frontmatter file under `contentDir`. A collection's edges render as `members:` (either the
 * `'@library'` token or a per-type block); every other type's render as `dependencies:`. Omit `edges` for a leaf.
 */
async function writeArtifact(
  contentDir: string,
  type: ArtifactType,
  slug: string,
  edges?: DirectArtifacts | '@library',
): Promise<void> {
  const filePath = path.join(contentDir, artifactFrontmatterPath(type, slug));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `---\nname: ${slug}\n${renderEdges(type, edges)}---\n\n# ${slug}\n`, 'utf8');
}

/** Renders an artifact's edge block: `members:` for a collection, `dependencies:` otherwise; empty when there are none. */
function renderEdges(type: ArtifactType, edges: DirectArtifacts | '@library' | undefined): string {
  if (edges === '@library') {
    return `members: '@library'\n`;
  }
  const key = type === 'collection' ? 'members' : 'dependencies';
  const lines: Array<string> = [];
  for (const edgeType of ARTIFACT_TYPE_VALUES) {
    const slugs = edges?.[edgeType] ?? [];
    if (slugs.length > 0) {
      const items = slugs.map((slug) => `    - ${slug}`).join('\n');
      lines.push(`  ${ARTIFACT_TYPES[edgeType].key}:\n${items}`);
    }
  }
  return lines.length === 0 ? '' : `${key}:\n${lines.join('\n')}\n`;
}

/**
 * Writes an artifact's file with a custom body following the frontmatter. Unlike `writeArtifact` (which emits a bare
 * `# <slug>` body), this lets a test place invocation tokens or include directives in the body.
 */
async function writeArtifactWithBody(
  contentDir: string,
  type: ArtifactType,
  slug: string,
  body: string,
  edges?: DirectArtifacts,
): Promise<void> {
  const filePath = path.join(contentDir, artifactFrontmatterPath(type, slug));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `---\nname: ${slug}\n${renderEdges(type, edges)}---\n\n${body}\n`, 'utf8');
}

/** Writes a partial inside a skill's `_partials/` directory — the include target a skill body expands. */
async function writeSkillPartial(contentDir: string, skillSlug: string, name: string, body: string): Promise<void> {
  const filePath = path.join(contentDir, 'skills', skillSlug, '_partials', name);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${body}\n`, 'utf8');
}

/**
 * Writes a subagent frontmatter file carrying a top-level `skills:` injection list, plus optional `dependencies:`
 * edges. Distinct from `writeArtifact`, which never emits the top-level `skills:` field.
 */
async function writeSubagent(
  contentDir: string,
  slug: string,
  injects: ReadonlyArray<string>,
  edges?: DirectArtifacts,
): Promise<void> {
  const filePath = path.join(contentDir, artifactFrontmatterPath('subagent', slug));
  await mkdir(path.dirname(filePath), { recursive: true });
  const injected = injects.map((skill) => `  - ${skill}`).join('\n');
  const frontmatter = `name: ${slug}\nskills:\n${injected}\n${renderEdges('subagent', edges)}`;
  await writeFile(filePath, `---\n${frontmatter}---\n\n# ${slug}\n`, 'utf8');
}
