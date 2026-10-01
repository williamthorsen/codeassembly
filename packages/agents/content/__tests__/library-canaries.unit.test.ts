import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { HARNESS_IDS, type RenderedTree, resolveClosure } from 'codeassembly/api';
import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { renderLibrary } from '../test-utils/rendered-library.ts';

// Renders the real library, not a fixture, to catch failures that only show up with real content: an unreplaced
// template token, a link that wasn't rewritten, or a canary artifact that no longer renders as deployment writes it.
//
// Rendering the whole catalog runs longer under parallel-worker load than the tier's own budget allows. The ceiling
// here matches the budget of the tiers above `unit`.
describe('library render', { timeout: 30_000 }, () => {
  describe.each(HARNESS_IDS)('for %s', (harness) => {
    it('does not leave any template token unreplaced', async () => {
      const offenders = listMarkdownEntries(await renderLibrary(harness))
        .filter(([, body]) => body.includes('{harness_home_dir}') || body.includes('{harness_guidance_file}'))
        .map(([deployedPath]) => deployedPath);

      expect(offenders).toEqual([]);
    });

    it('does not leave any bare-relative link target', async () => {
      const violations = listMarkdownEntries(await renderLibrary(harness)).flatMap(([deployedPath, body]) =>
        body
          .matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)
          .map((match) => match[2])
          .filter((target) => target !== undefined && !/^(https?:\/\/|\/|~\/|#)/.test(target))
          .map((target) => `  ${deployedPath}: [...](${target})`)
          .toArray(),
      );

      expect(violations, `Rendered Markdown contains bare-relative link targets:\n${violations.join('\n')}`).toEqual(
        [],
      );
    });

    it('renders every file of its own guidance template', async () => {
      const templateFiles = (await readdir(path.join(CONTENT_ROOT, 'guidance', '_harnesses', harness))).filter(
        (name) => !name.startsWith('.'),
      );
      const tree = await renderLibrary(harness);

      expect(templateFiles).not.toEqual([]);
      expect(templateFiles.filter((name) => tree[name] === undefined)).toEqual([]);
    });
  });

  describe('canaries', () => {
    it('renders the shell-conventions rulebook as its consult skill', async () => {
      const skill = readEntry(await renderLibrary('claude'), 'skills/consult-shell-conventions/SKILL.md');

      expect(skill).toContain('name: consult-shell-conventions');
      expect(skill).toContain('# Shell script conventions');
      expect(skill).not.toContain('slug:');
    });

    it('renders the people-report skill', async () => {
      const skill = readEntry(await renderLibrary('claude'), 'skills/people-report/SKILL.md');

      expect(skill).toContain('<!-- codeassembly-skill:people-report -->');
      expect(skill).toContain('# People report');
    });

    it('renders the canary subagent', async () => {
      const deployed = readEntry(await renderLibrary('claude'), 'agents/canary.md');

      expect(deployed).toContain('<!-- codeassembly-subagent:canary -->');
      expect(deployed).toContain('# Canary');
      expect(deployed).not.toContain('{tool:Read}');
      expect(deployed).not.toContain('{harness_home_dir}');
      expect(deployed).toContain('~/.claude');
    });

    it('reaches capture-event through the recommended collection and leaves the standalone canary out', async () => {
      const closure = await resolveClosure(CONTENT_ROOT, { collection: ['recommended'] });

      expect(closure.skill).toContain('capture-event');
      expect(closure.subagent).not.toContain('canary');
    });
  });
});

// region | Helpers

/** Lists the rendered Markdown files as path and body pairs. */
function listMarkdownEntries(tree: RenderedTree): ReadonlyArray<[string, string]> {
  return Object.entries(tree)
    .filter(([deployedPath]) => deployedPath.endsWith('.md'))
    .map(([deployedPath, { content }]) => [deployedPath, content]);
}

/** Returns a rendered file's text, throwing when the render does not contain it. */
function readEntry(tree: RenderedTree, deployedPath: string): string {
  const entry = tree[deployedPath];
  if (entry === undefined) {
    throw new Error(`The library render does not contain ${deployedPath}`);
  }
  return entry.content;
}

// endregion | Helpers
