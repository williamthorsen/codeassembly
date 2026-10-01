import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { listCatalog, resolveClosure } from 'codeassembly/api';
import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';

// Asserts that the content library's invocation edges resolve: Declaring a skill pulls the skills and subagents that
// it invokes into its closure, whether the invocation is an inline body token or a non-inline dispatch declared in
// frontmatter. An optional body token is the one invocation that does not contribute an edge, so the closure that
// it stays out of is asserted here alongside the closures entered by the others.
describe('library invocation edges', () => {
  it('pulls capture-event into capture-feedback via its body token', async () => {
    const closure = await resolveClosure(CONTENT_ROOT, { skill: ['capture-feedback'] });

    expect(closure.skill).toContain('capture-event');
  });

  it('pulls capture-feedback into collaborate, and capture-event transitively', async () => {
    const closure = await resolveClosure(CONTENT_ROOT, { skill: ['collaborate'] });

    expect(closure.skill).toContain('capture-feedback');
    expect(closure.skill).toContain('capture-event');
  });

  it('pulls summarize-change into add-change-record, which drafts the block through it', async () => {
    const closure = await resolveClosure(CONTENT_ROOT, { skill: ['add-change-record'] });

    expect(closure.skill).toContain('summarize-change');
  });

  it('pulls create-pr’s required delegates and leaves its optional one out', async () => {
    const closure = await resolveClosure(CONTENT_ROOT, { skill: ['create-pr'] });

    expect(closure.skill).toEqual(expect.arrayContaining(['create-gh-pr', 'summarize-change']));
    expect(closure.skill).not.toContain('create-bitbucket-pr');
  });

  it('leaves capture-lede-decision out of merge-pr’s closure and in triage’s', async () => {
    // The merge flow does not record a lede decision, so its body does not contain a token that pulls the skill in. It
    // reaches consumers through the triage collection alone, and both halves are asserted: without the second,
    // deleting the skill from the library would satisfy the first.
    const mergePr = await resolveClosure(CONTENT_ROOT, { skill: ['merge-pr'] });
    const triage = await resolveClosure(CONTENT_ROOT, { collection: ['triage'] });

    expect(mergePr.skill).not.toContain('capture-lede-decision');
    expect(triage.skill).toContain('capture-lede-decision');
  });

  it('pulls orchestrate dispatched subagents declared in frontmatter', async () => {
    const closure = await resolveClosure(CONTENT_ROOT, { skill: ['orchestrate'] });

    expect(closure.subagent).toEqual(
      expect.arrayContaining([
        'aspect-code-reviewer',
        'orchestrated-coder',
        'orchestrated-reviewer',
        'savings-analyzer',
      ]),
    );
  });

  it('pulls refine-plan review subagents declared in frontmatter', async () => {
    const closure = await resolveClosure(CONTENT_ROOT, { skill: ['refine-plan'] });

    expect(closure.subagent).toEqual(expect.arrayContaining(['plan-reviewer', 'plan-reviser']));
  });

  it('includes create-pr as a dependency of merge-pr, which names it in its body', async () => {
    const closure = await resolveClosure(CONTENT_ROOT, { skill: ['merge-pr'] });

    expect(closure.skill).toContain('create-pr');
  });

  it('pulls add-change-record and summarize-change into merge-pr, which offers the one on an absent block', async () => {
    const closure = await resolveClosure(CONTENT_ROOT, { skill: ['merge-pr'] });

    expect(closure.skill).toEqual(expect.arrayContaining(['add-change-record', 'summarize-change']));
  });

  it('resolves the entire content library without a cycle or missing artifact', async () => {
    // The whole-catalog resolution exercises every self-token (dropped, so it cannot form a self-cycle) and every
    // cross-reference edge (resolves to a real artifact) at once.
    const catalog = await listCatalog(CONTENT_ROOT);

    await expect(resolveClosure(CONTENT_ROOT, catalog)).resolves.toBeDefined();
  });

  it('does not leave a literal command reference to a known skill or subagent in any deployed content', async () => {
    // A bare `/slug` naming a library artifact is never rewritten (the render pass only touches `{skill:}` /
    // `{subagent:}` tokens). It renders only on Claude wherever it lives. The guard scans every deployed markdown
    // file, not just top-level skill/subagent bodies: `_data` reference docs, `_partials`, rulebooks, and collections
    // are all deployed too, and a literal reference in a non-rendered doc is the same defect. The trailing-boundary
    // guard excludes script paths (`/slug.mjs`) and file paths (`/slug/...`), which are not command references.
    const catalog = await listCatalog(CONTENT_ROOT);
    const known = new Set([...catalog.skill, ...catalog.subagent]);
    const tokenRe = /\{(?:skill|subagent)\??:[a-z][a-z0-9-]*\}/g;
    const literalRefRe = /(?<![\w./])\/([a-z][a-z0-9-]*)(?![\w/.-])/g;
    const offenders: Array<string> = [];

    const files = await listMarkdownFilesRecursively(CONTENT_ROOT);
    for (const file of files) {
      const body = (await readFile(file, 'utf8')).replace(tokenRe, '');
      for (const [, ref] of body.matchAll(literalRefRe)) {
        if (ref !== undefined && known.has(ref)) {
          offenders.push(`${path.relative(CONTENT_ROOT, file)} -> /${ref}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/** Lists every markdown file under `dir` recursively: the full set of deployed content scanned by the completeness guard. */
async function listMarkdownFilesRecursively(dir: string): Promise<Array<string>> {
  const found: Array<string> = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await listMarkdownFilesRecursively(full)));
    } else if (entry.name.endsWith('.md')) {
      found.push(full);
    }
  }
  return found;
}
