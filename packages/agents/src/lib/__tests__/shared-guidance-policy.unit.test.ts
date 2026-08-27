import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveContentDir } from '../content-resolver.ts';
import { expandIncludes } from '../directive-expander.ts';

interface LinkViolation {
  file: string;
  target: string;
}

/**
 * Shared guidance is inlined into each harness's flat guidance file, where `rewriteMarkdownPaths` resolves a link
 * against the destination rather than the source tree, so a source-tree-relative target lands nowhere. The policy:
 * no outbound Markdown links. Skills are referenced by name; path-level conventions travel through the skill chain
 * (which the install-time rewriter handles correctly).
 *
 * The body scanned is the include-expanded one, so a partial the shared file inlines is held to the policy too.
 */
describe('shared guidance link policy', () => {
  it('contains no bare-relative Markdown link targets', async () => {
    const contentDir = resolveContentDir();
    const violations = await findBareRelativeLinks(path.join(contentDir, 'guidance', 'shared'), contentDir);
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});

// region | Helpers

/** Collects every bare-relative link target in the expanded body of each Markdown file under a directory. */
async function findBareRelativeLinks(dir: string, contentDir: string): Promise<Array<LinkViolation>> {
  const violations: Array<LinkViolation> = [];
  await walkMarkdownFiles(dir, async (filePath) => {
    const content = await expandIncludes(filePath, contentDir);
    const matches = content.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g);
    for (const match of matches) {
      const target = match[2];
      if (target === undefined || isAllowedTarget(target)) {
        continue;
      }
      violations.push({ file: path.relative(dir, filePath), target });
    }
  });
  return violations;
}

/** Renders the violations as the assertion's failure message, or an empty string when there are none. */
function formatViolations(violations: ReadonlyArray<LinkViolation>): string {
  if (violations.length === 0) {
    return '';
  }
  const lines = violations.map((v) => `  ${v.file}: [...](${v.target})`);
  return `Shared guidance files must not contain outbound Markdown links.\nViolations:\n${lines.join('\n')}`;
}

/** Reports whether a link target resolves without depending on where the file is written. */
function isAllowedTarget(target: string): boolean {
  return /^(https?:\/\/|\/|~\/|#)/.test(target);
}

/** Visits every Markdown file under a directory, recursing into subdirectories. */
async function walkMarkdownFiles(dir: string, visit: (filePath: string) => Promise<void>): Promise<void> {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) {
      await walkMarkdownFiles(full, visit);
    } else if (entry.endsWith('.md')) {
      await visit(full);
    }
  }
}

// endregion | Helpers
