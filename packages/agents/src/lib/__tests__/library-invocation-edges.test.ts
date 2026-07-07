import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveContentDir } from '../content-resolver.ts';
import { libraryResolver } from '../content-sources.ts';
import { resolveClosure } from '../dependency-resolver.ts';
import { enumerateCatalogSlugs } from '../library-catalog.ts';

// Asserts that the content library's invocation edges resolve: declaring a skill pulls the skills and subagents it
// invokes into its closure, whether the invocation is an inline body token or a non-inline dispatch declared in
// frontmatter.
describe('library invocation edges', () => {
  const contentDir = resolveContentDir();

  it('pulls capture-event into capture-feedback via its body token', async () => {
    const closure = await resolveClosure({ skill: ['capture-feedback'] }, libraryResolver(contentDir));

    expect(closure.skills).toContain('capture-event');
  });

  it('pulls capture-feedback into collaborate, and capture-event transitively', async () => {
    const closure = await resolveClosure({ skill: ['collaborate'] }, libraryResolver(contentDir));

    expect(closure.skills).toContain('capture-feedback');
    expect(closure.skills).toContain('capture-event');
  });

  it('pulls create-pr delegates and the changelog-writer they reach', async () => {
    const closure = await resolveClosure({ skill: ['create-pr'] }, libraryResolver(contentDir));

    expect(closure.skills).toEqual(expect.arrayContaining(['create-gh-pr', 'create-bitbucket-pr', 'summarize-change']));
    expect(closure.subagents).toContain('changelog-writer');
  });

  it('pulls orchestrate dispatched subagents declared in frontmatter', async () => {
    const closure = await resolveClosure({ skill: ['orchestrate'] }, libraryResolver(contentDir));

    expect(closure.subagents).toEqual(
      expect.arrayContaining([
        'aspect-code-reviewer',
        'orchestrated-coder',
        'orchestrated-reviewer',
        'savings-analyzer',
      ]),
    );
  });

  it('pulls refine-plan review subagents declared in frontmatter', async () => {
    const closure = await resolveClosure({ skill: ['refine-plan'] }, libraryResolver(contentDir));

    expect(closure.subagents).toEqual(expect.arrayContaining(['plan-reviewer', 'plan-reviser']));
  });

  it('ships create-pr as a dependency of merge-pr, which names it in its body', async () => {
    const closure = await resolveClosure({ skill: ['merge-pr'] }, libraryResolver(contentDir));

    expect(closure.skills).toContain('create-pr');
  });

  it('resolves the entire content library without a cycle or missing artifact', async () => {
    // The whole-catalog resolution exercises every self-token (dropped, so no self-cycle) and every cross-reference
    // edge (resolves to a real artifact) at once — the strongest end-to-end check on the reference reclassification.
    const catalog = await enumerateCatalogSlugs(contentDir);

    await expect(resolveClosure(catalog, libraryResolver(contentDir))).resolves.toBeDefined();
  });

  it('leaves no literal command reference to a known skill or subagent in any deployed content', async () => {
    // A bare `/slug` naming a library artifact is never rewritten — the render pass only touches `{skill:}` /
    // `{subagent:}` tokens — so it renders only on Claude wherever it lives. The guard scans every deployed markdown
    // file, not just top-level skill/subagent bodies: `_data` reference docs, `_partials`, rulebooks, and collections
    // all ship too, and a literal reference in a non-rendered doc is the same defect. The trailing-boundary guard
    // excludes script paths (`/slug.mjs`) and file paths (`/slug/...`), which are not command references.
    const catalog = await enumerateCatalogSlugs(contentDir);
    const known = new Set([...(catalog.skill ?? []), ...(catalog.subagent ?? [])]);
    const tokenRe = /\{(?:skill|subagent):[a-z][a-z0-9-]*\}/g;
    const literalRefRe = /(?<![\w./])\/([a-z][a-z0-9-]*)(?![\w/.-])/g;
    const offenders: Array<string> = [];

    for (const file of await listMarkdownFilesRecursively(contentDir)) {
      const body = (await readFile(file, 'utf8')).replace(tokenRe, '');
      for (const [, ref] of body.matchAll(literalRefRe)) {
        if (ref !== undefined && known.has(ref)) {
          offenders.push(`${path.relative(contentDir, file)} -> /${ref}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/** Lists every markdown file under `dir` recursively — the full set of deployed content the completeness guard scans. */
async function listMarkdownFilesRecursively(dir: string): Promise<Array<string>> {
  const found: Array<string> = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await listMarkdownFilesRecursively(full)));
    } else if (entry.name.endsWith('.md')) {
      found.push(full);
    }
  }
  return found;
}
