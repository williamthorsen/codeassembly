import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveContentDir } from '../content-resolver.js';

interface LinkViolation {
  file: string;
  target: string;
}

/**
 * Shared guidance lives under a harness-neutral path (`~/.agents/`) and
 * cannot resolve harness-scoped targets. The policy: no outbound Markdown
 * links. Skills are referenced by name; path-level conventions travel through
 * the skill chain (which the install-time rewriter handles correctly).
 */
describe('shared guidance link policy', () => {
  it('contains no bare-relative Markdown link targets', async () => {
    const sharedDir = path.join(resolveContentDir(), 'guidance', 'shared');
    const violations = await findBareRelativeLinks(sharedDir);
    expect(violations, formatViolations(violations)).toEqual([]);
  });
});

async function findBareRelativeLinks(dir: string): Promise<Array<LinkViolation>> {
  const violations: Array<LinkViolation> = [];
  await walkMarkdownFiles(dir, async (filePath) => {
    const content = await readFile(filePath, 'utf8');
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

function isAllowedTarget(target: string): boolean {
  return /^(https?:\/\/|\/|~\/|#)/.test(target);
}

function formatViolations(violations: ReadonlyArray<LinkViolation>): string {
  if (violations.length === 0) {
    return '';
  }
  const lines = violations.map((v) => `  ${v.file}: [...](${v.target})`);
  return `Shared guidance files must not contain outbound Markdown links.\nViolations:\n${lines.join('\n')}`;
}
