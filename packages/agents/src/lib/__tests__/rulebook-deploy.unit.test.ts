import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSourceResolver, libraryResolver, type SourceResolver } from '../content-sources.ts';
import { resolveRulebook } from '../rulebook-deploy.ts';

const ABSENT_DIR = path.join(tmpdir(), 'rulebook-deploy-absent-source');

describe(resolveRulebook, () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = path.join(tmpdir(), `rulebook-deploy-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(contentDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  it('names the origin and the path when the resolved source carries no rulebook file', async () => {
    await expect(resolveRulebook('ghost', buildAlwaysResolvingResolver(ABSENT_DIR))).rejects.toThrow(
      /Declared rulebook "ghost" was not found in the library/,
    );
  });

  it('attaches the read failure as the cause', async () => {
    await expect(resolveRulebook('ghost', buildAlwaysResolvingResolver(ABSENT_DIR))).rejects.toHaveProperty(
      'cause',
      expect.any(Error),
    );
  });

  it('inlines a partial into the resolved body', async () => {
    await writeRulebookPartial(contentDir, 'doctrine.md', 'Every comment pays rent.');
    await writeRulebook(contentDir, 'comment-rules', '<!-- include: _partials/doctrine.md / -->');

    const resolved = await resolveRulebook('comment-rules', libraryResolver(contentDir));

    expect(resolved.body).toContain('Every comment pays rent.');
  });

  it("resolves an include against the rulebook's own source rather than the library behind it", async () => {
    const sourceDir = path.join(contentDir, 'org');
    const libraryDir = path.join(contentDir, 'library');
    await writeRulebookPartial(sourceDir, 'doctrine.md', 'The org rule.');
    await writeRulebook(sourceDir, 'comment-rules', '<!-- include: _partials/doctrine.md / -->');
    await writeRulebookPartial(libraryDir, 'doctrine.md', 'The library rule.');

    const resolver = createSourceResolver([{ name: 'org', dir: sourceDir }], libraryDir);
    const resolved = await resolveRulebook('comment-rules', resolver);

    expect(resolved.body).toContain('The org rule.');
    expect(resolved.body).not.toContain('The library rule.');
  });

  it('reports the file and line when an include target is missing', async () => {
    await writeRulebook(contentDir, 'comment-rules', '<!-- include: _partials/ghost.md / -->');

    await expect(resolveRulebook('comment-rules', libraryResolver(contentDir))).rejects.toThrow(
      /Include directive target not found: .*comment-rules\.md:\d+/,
    );
  });
});

// region | Helpers

/**
 * Builds a resolver that reports every slug as resolving under `dir` without probing for the file. This is the
 * only way to reach the read failure: the real resolver resolves by existence, so it never hands back a directory
 * whose frontmatter file is missing.
 */
function buildAlwaysResolvingResolver(dir: string): SourceResolver {
  return {
    libraryDir: dir,
    sources: [],
    resolve: () => Promise.resolve({ dir, source: undefined }),
  };
}

/** Writes a rulebook frontmatter file under `contentDir`, with `body` following its frontmatter. */
async function writeRulebook(contentDir: string, slug: string, body: string): Promise<void> {
  const filePath = path.join(contentDir, 'guidance', 'rulebooks', `${slug}.md`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `---\nslug: ${slug}\n---\n\n${body}\n`, 'utf8');
}

/** Writes a partial beside the rulebooks, where a rulebook body's relative include resolves it. */
async function writeRulebookPartial(contentDir: string, name: string, body: string): Promise<void> {
  const filePath = path.join(contentDir, 'guidance', 'rulebooks', '_partials', name);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${body}\n`, 'utf8');
}

// endregion | Helpers
