import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildIncludeGraph } from '../include-graph.ts';

/** A root whose two skills share a partial that includes a second one, with a document outside any skill. */
const CONTENT_FILES: Readonly<Record<string, string>> = {
  '_partials/inner.md': 'Inner.\n',
  '_partials/shared.md': 'Shared.\n\n<!-- include: ./inner.md / -->\n',
  'guidance/shared/AGENTS.md': 'Guide.\n\n<!-- include: ../../_partials/shared.md / -->\n',
  'skills/demo/SKILL.md': 'Demo.\n\n<!-- include: ../../_partials/shared.md / -->\n',
  'skills/plain/SKILL.md': 'Plain.\n',
};

describe(buildIncludeGraph, () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'include-graph-'));
    await writeFiles(root, CONTENT_FILES);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("lists a file's transitive includes in discovery order, with the edge that reaches each one", async () => {
    const graph = await buildIncludeGraph(root);

    const closure = graph.listClosure(path.join(root, 'skills/demo/SKILL.md'));

    expect(closure.files.map((file) => path.relative(root, file))).toStrictEqual([
      'skills/demo/SKILL.md',
      '_partials/shared.md',
      '_partials/inner.md',
    ]);
    expect(
      closure.includes.map(({ file, includer }) => ({
        file: path.relative(root, file),
        includer: path.relative(root, includer),
      })),
    ).toStrictEqual([
      { file: '_partials/shared.md', includer: 'skills/demo/SKILL.md' },
      { file: '_partials/inner.md', includer: '_partials/shared.md' },
    ]);
  });

  it('terminates on an include cycle, listing each file of the cycle once', async () => {
    await writeFiles(root, {
      '_partials/inner.md': 'Inner.\n\n<!-- include: ./shared.md / -->\n',
    });
    const graph = await buildIncludeGraph(root);

    const closure = graph.listClosure(path.join(root, '_partials/shared.md'));

    expect(closure.files.map((file) => path.relative(root, file))).toStrictEqual([
      '_partials/shared.md',
      '_partials/inner.md',
    ]);
  });

  it('reports a file outside the root as reaching nothing', async () => {
    const graph = await buildIncludeGraph(root);
    const outside = path.join(root, '..', 'elsewhere.md');

    expect(graph.listClosure(outside).files).toStrictEqual([path.resolve(outside)]);
    expect(graph.countReach(outside)).toBe(0);
  });

  describe('documents', () => {
    it('counts a Markdown file that nothing includes, wherever it lies', async () => {
      await writeFiles(root, { 'guidance/_harnesses/claude/CLAUDE.md': 'Claude.\n' });
      const graph = await buildIncludeGraph(root);

      expect([...graph.documents].map((file) => path.relative(root, file)).toSorted()).toStrictEqual([
        'guidance/_harnesses/claude/CLAUDE.md',
        'guidance/shared/AGENTS.md',
        'skills/demo/SKILL.md',
        'skills/plain/SKILL.md',
      ]);
    });

    it('treats a file that another file includes as deploying inside it, wherever it lies', async () => {
      await writeFiles(root, {
        'guidance/_harnesses/claude/CLAUDE.md': '<!-- include: ../../shared/AGENTS.md / -->\n',
      });
      const graph = await buildIncludeGraph(root);

      expect([...graph.documents].map((file) => path.relative(root, file))).not.toContain('guidance/shared/AGENTS.md');
      expect(graph.countReach(path.join(root, 'guidance/shared/AGENTS.md'))).toBe(1);
    });

    it('counts no file of the collection, partial, and test trees', async () => {
      await writeFiles(root, {
        '__tests__/fixtures/case.md': 'Fixture.\n',
        'collections/all.md': 'All.\n',
      });
      const graph = await buildIncludeGraph(root);

      const files = [...graph.documents].map((file) => path.relative(root, file));
      expect(files).not.toContain('__tests__/fixtures/case.md');
      expect(files).not.toContain('_partials/shared.md');
      expect(files).not.toContain('collections/all.md');
      expect(graph.countReach(path.join(root, 'collections/all.md'))).toBe(0);
    });

    it("counts a partial's reach at every depth, and reports zero for one that no document includes", async () => {
      await writeFiles(root, { '_partials/unused.md': 'Unused.\n' });
      const graph = await buildIncludeGraph(root);

      expect(graph.countReach(path.join(root, '_partials/shared.md'))).toBe(2);
      expect(graph.countReach(path.join(root, '_partials/inner.md'))).toBe(2);
      expect(graph.countReach(path.join(root, '_partials/unused.md'))).toBe(0);
    });

    it('counts a partial included by a test file toward no reach', async () => {
      await writeFiles(root, {
        '__tests__/fixtures/case.md': '<!-- include: ../../_partials/unused.md / -->\n',
        '_partials/unused.md': 'Unused.\n',
      });
      const graph = await buildIncludeGraph(root);

      expect(graph.countReach(path.join(root, '_partials/unused.md'))).toBe(0);
    });
  });

  describe('unresolved directives', () => {
    it('reports a file whose own directive names no file, and fails nothing else in the root', async () => {
      await writeFiles(root, { 'guidance/example.md': '<!-- include: ./absent.md / -->\n' });
      const graph = await buildIncludeGraph(root);

      expect(graph.hasUnresolvedIncludes(path.join(root, 'guidance/example.md'))).toBe(true);
      expect(graph.hasUnresolvedIncludes(path.join(root, 'skills/demo/SKILL.md'))).toBe(false);
      expect(graph.countReach(path.join(root, '_partials/shared.md'))).toBe(2);
    });

    it('reports a file whose unresolved directive lies in something that it includes', async () => {
      await writeFiles(root, { '_partials/inner.md': '<!-- include: ./absent.md / -->\n' });
      const graph = await buildIncludeGraph(root);

      expect(graph.hasUnresolvedIncludes(path.join(root, 'skills/demo/SKILL.md'))).toBe(true);
    });
  });
});

// region | Helpers

/** Writes each file beneath a root, creating its directories. */
async function writeFiles(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content, 'utf8');
  }
}

// endregion | Helpers
