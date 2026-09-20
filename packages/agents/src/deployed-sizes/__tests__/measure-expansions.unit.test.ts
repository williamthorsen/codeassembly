import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DeployedPath } from '../../commands/sync/collect-deployed-paths.ts';
import { measureExpansions } from '../measure-expansions.ts';

/** A content root whose two skills share a partial that includes a second one. */
const CONTENT_FILES: Readonly<Record<string, string>> = {
  '_partials/inner.md': 'Inner.\n',
  '_partials/shared.md':
    'Shared, and long enough that its own bytes differ from the bytes it expands to.\n\n<!-- include: ./inner.md / -->\n',
  'skills/demo/SKILL.md': 'Demo.\n\n<!-- include: ../../_partials/shared.md / -->\n',
  'skills/plain/SKILL.md': 'Plain.\n',
};

const INNER_BYTES = Buffer.byteLength(CONTENT_FILES['_partials/inner.md'] ?? '', 'utf8');
const SHARED_BYTES = Buffer.byteLength(CONTENT_FILES['_partials/shared.md'] ?? '', 'utf8');

describe(measureExpansions, () => {
  let contentRoot: string;

  beforeEach(async () => {
    contentRoot = await mkdtemp(path.join(tmpdir(), 'measure-expansions-'));
    await writeFiles(contentRoot, CONTENT_FILES);
  });

  afterEach(async () => {
    await rm(contentRoot, { recursive: true, force: true });
  });

  it('states each reached partial once, with its own bytes and the documents that it reaches', async () => {
    const measured = await measureExpansions([skillBody(contentRoot, 'claude/skills/demo/SKILL.md', 'demo')]);

    expect(measured.expansions).toStrictEqual({
      'partial:library/_partials/inner.md': { bytes: INNER_BYTES, reach: 1 },
      'partial:library/_partials/shared.md': { bytes: SHARED_BYTES, reach: 1 },
    });
  });

  it("states a partial's own bytes rather than the bytes that it expands to", async () => {
    const measured = await measureExpansions([skillBody(contentRoot, 'claude/skills/demo/SKILL.md', 'demo')]);

    expect(measured.expansions['partial:library/_partials/shared.md']?.bytes).toBe(SHARED_BYTES);
    expect(measured.expansions['partial:library/_partials/shared.md']?.bytes).not.toBe(SHARED_BYTES + INNER_BYTES);
  });

  it('counts one skill deployed to two harnesses as two documents of reach', async () => {
    const measured = await measureExpansions([
      skillBody(contentRoot, 'claude/skills/demo/SKILL.md', 'demo'),
      skillBody(contentRoot, 'rovo/skills/demo/SKILL.md', 'demo'),
    ]);

    expect(measured.expansions['partial:library/_partials/shared.md']?.reach).toBe(2);
  });

  it('names the expansion keys that each deployed document holds', async () => {
    const measured = await measureExpansions([
      skillBody(contentRoot, 'claude/skills/demo/SKILL.md', 'demo'),
      skillBody(contentRoot, 'claude/skills/plain/SKILL.md', 'plain'),
    ]);

    expect(measured.documentExpansions).toStrictEqual({
      'claude/skills/demo/SKILL.md': ['partial:library/_partials/shared.md', 'partial:library/_partials/inner.md'],
      'claude/skills/plain/SKILL.md': [],
    });
  });

  it('names the declared source in the key of a partial that resolved from one', async () => {
    const document = skillBody(contentRoot, 'claude/skills/demo/SKILL.md', 'demo', 'acme');

    const measured = await measureExpansions([document]);

    expect(Object.keys(measured.expansions).toSorted()).toStrictEqual([
      'partial:acme/_partials/inner.md',
      'partial:acme/_partials/shared.md',
    ]);
  });

  it('leaves the document itself out of the expansions that it holds', async () => {
    const measured = await measureExpansions([skillBody(contentRoot, 'claude/skills/plain/SKILL.md', 'plain')]);

    expect(measured.expansions).toStrictEqual({});
    expect(measured.documentExpansions).toStrictEqual({ 'claude/skills/plain/SKILL.md': [] });
  });

  it('states its own partials for each of two content roots', async () => {
    const otherRoot = await mkdtemp(path.join(tmpdir(), 'measure-expansions-other-'));
    try {
      await writeFiles(otherRoot, {
        '_partials/only-here.md': 'Only here.\n',
        'skills/other/SKILL.md': 'Other.\n\n<!-- include: ../../_partials/only-here.md / -->\n',
      });

      const measured = await measureExpansions([
        skillBody(contentRoot, 'claude/skills/demo/SKILL.md', 'demo'),
        skillBody(otherRoot, 'claude/skills/other/SKILL.md', 'other', 'acme'),
      ]);

      expect(Object.keys(measured.expansions).toSorted()).toStrictEqual([
        'partial:acme/_partials/only-here.md',
        'partial:library/_partials/inner.md',
        'partial:library/_partials/shared.md',
      ]);
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });

  it('states no expansion and raises nothing for a content root that cannot be read', async () => {
    // A file where the content root belongs, so that the walk that builds the graph fails rather than finding nothing.
    const unreadableRoot = path.join(contentRoot, '_partials', 'inner.md');

    const measured = await measureExpansions([skillBody(unreadableRoot, 'claude/skills/demo/SKILL.md', 'demo')]);

    expect(measured.expansions).toStrictEqual({});
    expect(measured.documentExpansions).toStrictEqual({});
  });

  it('leaves a file that names no authored source out of the measurement', async () => {
    const asset: DeployedPath = {
      key: 'claude/skills/demo/run.mjs',
      absPath: '/deployed/claude/skills/demo/run.mjs',
      kind: 'asset',
      role: 'other',
      harnessId: 'claude',
      sourceRoot: undefined,
      authored: undefined,
    };

    const measured = await measureExpansions([asset]);

    expect(measured).toStrictEqual({ expansions: {}, documentExpansions: {} });
  });
});

// region | Helpers

/** One deployed skill body, authored at `skills/{slug}/SKILL.md` under `contentRoot`. */
function skillBody(contentRoot: string, key: string, slug: string, sourceName?: string): DeployedPath {
  return {
    key,
    absPath: path.join('/deployed', key),
    kind: 'document',
    role: 'skill',
    harnessId: key.startsWith('rovo/') ? 'rovo' : 'claude',
    sourceRoot: contentRoot,
    authored: { file: path.join(contentRoot, 'skills', slug, 'SKILL.md'), contentRoot, sourceName },
  };
}

/** Writes each file beneath a root, creating its directories. */
async function writeFiles(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content, 'utf8');
  }
}

// endregion | Helpers
