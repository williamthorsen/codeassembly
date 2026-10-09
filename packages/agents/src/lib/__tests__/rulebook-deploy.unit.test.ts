import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSourceResolver, type SourceResolver } from '../content-sources.ts';
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

  it('names the origin and the path when the resolved source does not contain a rulebook file', async () => {
    await expect(resolveRulebook('ghost', buildAlwaysResolvingResolver(ABSENT_DIR))).rejects.toThrow(
      /Declared rulebook "ghost" was not found in source "codeassembly" at .*ghost\.md/,
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

    const resolved = await resolveRulebook(
      'comment-rules',
      createSourceResolver([{ name: 'codeassembly', dir: contentDir }]),
    );

    expect(resolved.body).toContain('Every comment pays rent.');
  });

  it("resolves an include against the rulebook's own source rather than a lower-precedence source", async () => {
    const sourceDir = path.join(contentDir, 'org');
    const lowerDir = path.join(contentDir, 'lower');
    await writeRulebookPartial(sourceDir, 'doctrine.md', 'The org rule.');
    await writeRulebook(sourceDir, 'comment-rules', '<!-- include: _partials/doctrine.md / -->');
    await writeRulebookPartial(lowerDir, 'doctrine.md', 'The lower rule.');

    const resolver = createSourceResolver([
      { name: 'org', dir: sourceDir },
      { name: 'lower', dir: lowerDir },
    ]);
    const resolved = await resolveRulebook('comment-rules', resolver);

    expect(resolved.body).toContain('The org rule.');
    expect(resolved.body).not.toContain('The lower rule.');
  });

  it('reads the harnesses to which the rulebook deploys', async () => {
    await writeRulebook(contentDir, 'claude-models', 'Use the latest model.', 'supported-harnesses: claude');

    const resolved = await resolveRulebook(
      'claude-models',
      createSourceResolver([{ name: 'codeassembly', dir: contentDir }]),
    );

    expect(resolved.targetHarnesses).toEqual(['claude']);
  });

  it('when supported-harnesses is absent, leaves targetHarnesses undefined', async () => {
    await writeRulebook(contentDir, 'comment-rules', 'Every comment pays rent.');

    const resolved = await resolveRulebook(
      'comment-rules',
      createSourceResolver([{ name: 'codeassembly', dir: contentDir }]),
    );

    expect(resolved).not.toHaveProperty('targetHarnesses');
  });

  it('reports the file and line when an include target is missing', async () => {
    await writeRulebook(contentDir, 'comment-rules', '<!-- include: _partials/ghost.md / -->');

    await expect(
      resolveRulebook('comment-rules', createSourceResolver([{ name: 'codeassembly', dir: contentDir }])),
    ).rejects.toThrow(/Include directive target not found: .*comment-rules\.md:\d+/);
  });
});

// region | Helpers

/**
 * Builds a resolver that reports every slug as resolving under `dir` without probing for the file. This is the
 * only way to reach the read failure: The real resolver resolves by existence, so it never returns a directory
 * whose frontmatter file is missing.
 */
function buildAlwaysResolvingResolver(dir: string): SourceResolver {
  return {
    sources: [{ name: 'codeassembly', dir }],
    resolve: () => Promise.resolve({ dir, source: 'codeassembly' }),
  };
}

/**
 * Writes a rulebook frontmatter file under `contentDir`, with `body` following its frontmatter and `extraFrontmatter`
 * appended to the slug line.
 */
async function writeRulebook(contentDir: string, slug: string, body: string, extraFrontmatter = ''): Promise<void> {
  const filePath = path.join(contentDir, 'guidance', 'rulebooks', `${slug}.md`);
  await mkdir(path.dirname(filePath), { recursive: true });
  const frontmatter = extraFrontmatter === '' ? `slug: ${slug}` : `slug: ${slug}\n${extraFrontmatter}`;
  await writeFile(filePath, `---\n${frontmatter}\n---\n\n${body}\n`, 'utf8');
}

/** Writes a partial beside the rulebooks, where a rulebook body's relative include resolves it. */
async function writeRulebookPartial(contentDir: string, name: string, body: string): Promise<void> {
  const filePath = path.join(contentDir, 'guidance', 'rulebooks', '_partials', name);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${body}\n`, 'utf8');
}

// endregion | Helpers
