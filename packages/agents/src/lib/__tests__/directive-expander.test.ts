import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DirectiveExpansionError, expandIncludes } from '../directive-expander.js';

describe(expandIncludes, () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = path.join(tmpdir(), `directive-expander-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(contentDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  async function writeSource(relPath: string, content: string): Promise<string> {
    const fullPath = path.join(contentDir, relPath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
    return fullPath;
  }

  describe('resolution', () => {
    it('replaces a single directive with the included file content', async () => {
      const host = await writeSource(
        'platforms/claude/CLAUDE.md',
        ['Read AGENTS.md.', '', '<!-- include: ../../shared/AGENTS.md -->', ''].join('\n'),
      );
      await writeSource('shared/AGENTS.md', ['# Shared instructions', '', 'Be courteous.', ''].join('\n'));

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['Read AGENTS.md.', '', '# Shared instructions', '', 'Be courteous.', ''].join('\n'));
    });

    it('resolves against the directive-bearing file directory, not the entry point directory', async () => {
      const host = await writeSource(
        'platforms/rovodev/AGENTS.md',
        ['<!-- include: ./codeassembly-guidance.md -->', ''].join('\n'),
      );
      await writeSource('platforms/rovodev/codeassembly-guidance.md', 'Rovodev-specific.\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe('Rovodev-specific.\n');
    });

    it('replaces multiple directives in order', async () => {
      const host = await writeSource('host.md', ['<!-- include: a.md -->', '<!-- include: b.md -->', ''].join('\n'));
      await writeSource('a.md', 'AAA\n');
      await writeSource('b.md', 'BBB\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['AAA', 'BBB', ''].join('\n'));
    });

    it('expands nested directives recursively', async () => {
      const host = await writeSource('host.md', '<!-- include: nested/level1.md -->\n');
      await writeSource(
        'nested/level1.md',
        ['Level 1 prefix', '<!-- include: ./level2.md -->', 'Level 1 suffix', ''].join('\n'),
      );
      await writeSource('nested/level2.md', 'Level 2 content\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['Level 1 prefix', 'Level 2 content', 'Level 1 suffix', ''].join('\n'));
    });

    it('tolerates leading and trailing whitespace around the directive', async () => {
      const host = await writeSource(
        'host.md',
        ['  <!-- include: target.md -->  ', '\t<!--\tinclude:\ttarget.md\t-->\t', ''].join('\n'),
      );
      await writeSource('target.md', 'X\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['X', 'X', ''].join('\n'));
    });

    it('does not expand inline-prose mentions of the directive', async () => {
      const host = await writeSource(
        'host.md',
        [
          'Use the `<!-- include: target.md -->` syntax to include files.',
          'Prefix text <!-- include: target.md --> suffix text',
          '',
        ].join('\n'),
      );
      await writeSource('target.md', 'INCLUDED\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(
        [
          'Use the `<!-- include: target.md -->` syntax to include files.',
          'Prefix text <!-- include: target.md --> suffix text',
          '',
        ].join('\n'),
      );
    });

    it('returns content unchanged when no directives are present', async () => {
      const host = await writeSource('host.md', '# Title\n\nBody.\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe('# Title\n\nBody.\n');
    });

    it('allows the same target to be included from independent branches', async () => {
      const host = await writeSource(
        'host.md',
        ['<!-- include: target.md -->', '<!-- include: target.md -->', ''].join('\n'),
      );
      await writeSource('target.md', 'shared\n');

      const result = await expandIncludes(host, contentDir);

      expect(result).toBe(['shared', 'shared', ''].join('\n'));
    });
  });

  describe('error cases', () => {
    it('throws not-found when the resolved path does not exist', async () => {
      const host = await writeSource('host.md', '<!-- include: missing.md -->\n');

      await expect(expandIncludes(host, contentDir)).rejects.toMatchObject({
        name: 'DirectiveExpansionError',
        reason: 'not-found',
        message: expect.stringContaining('host.md:1'),
      });
    });

    it('reports the correct line number when the directive is not on line 1', async () => {
      const host = await writeSource(
        'host.md',
        ['# Title', '', 'Some prose.', '<!-- include: missing.md -->', ''].join('\n'),
      );

      await expect(expandIncludes(host, contentDir)).rejects.toMatchObject({
        reason: 'not-found',
        message: expect.stringContaining(':4'),
      });
    });

    it('throws out-of-tree when the resolved path escapes contentDir', async () => {
      const host = await writeSource('platforms/claude/CLAUDE.md', '<!-- include: ../../../escape.md -->\n');

      await expect(expandIncludes(host, contentDir)).rejects.toMatchObject({
        reason: 'out-of-tree',
        message: expect.stringContaining('out-of-tree'),
      });
    });

    it('throws cycle when an included file transitively includes its host', async () => {
      const host = await writeSource('a.md', '<!-- include: b.md -->\n');
      await writeSource('b.md', '<!-- include: a.md -->\n');

      const promise = expandIncludes(host, contentDir);
      await expect(promise).rejects.toBeInstanceOf(DirectiveExpansionError);
      await expect(promise).rejects.toMatchObject({
        reason: 'cycle',
        message: expect.stringContaining('cycle detected'),
      });
    });

    it('throws cycle for a self-reference', async () => {
      const host = await writeSource('self.md', '<!-- include: ./self.md -->\n');

      await expect(expandIncludes(host, contentDir)).rejects.toMatchObject({
        reason: 'cycle',
      });
    });
  });
});
