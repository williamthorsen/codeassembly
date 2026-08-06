import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Installable Markdown content is rewritten at install time. Runtime cross-references to other installable files must
// use the `{harness_home_dir}/...` template (expanded by the install pipeline) or a relative Markdown link (rewritten
// by `rewriteMarkdownPaths`). Raw `packages/agents/content/...` paths resolve only inside this monorepo and break in
// every installed context, so they are forbidden in installable Markdown — except in the small set of files below,
// whose references are intentional source-tree citations (documentation about where the canonical source lives).
const ALLOWLIST: ReadonlyArray<string> = [
  '_partials/README.md',
  'skills/_data/artifact-conventions.md',
  'skills/_data/ticket-id-extraction.md',
  'skills/anti-patterns/SKILL.md',
  'skills/common-mistakes/SKILL.md',
  'skills/orchestrate/_data/reviewer-context-packages.md',
];

const FORBIDDEN_PATTERN = 'packages/agents/content/';

const CONTENT_ROOT = new URL('../../content/', import.meta.url).pathname;

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

describe('installable-content path conventions', () => {
  it(`no installable Markdown file outside the allowlist contains a raw \`${FORBIDDEN_PATTERN}\` reference`, async () => {
    const violations = await findViolations();
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  it('every allowlist entry resolves to a real file', async () => {
    const files: Array<string> = [];
    await collectMarkdownFiles(CONTENT_ROOT, CONTENT_ROOT, files);
    const present = new Set(files.map((f) => f.split(path.sep).join('/')));
    const missing = ALLOWLIST.filter((entry) => !present.has(entry));
    expect(missing, `Stale allowlist entries (file no longer exists): ${missing.join(', ')}`).toEqual([]);
  });
});

// region | Helpers

async function collectMarkdownFiles(dir: string, root: string, out: Array<string>): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownFiles(full, root, out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(path.relative(root, full));
    }
  }
}

async function findViolations(): Promise<ReadonlyArray<Violation>> {
  const violations: Array<Violation> = [];
  const files: Array<string> = [];
  await collectMarkdownFiles(CONTENT_ROOT, CONTENT_ROOT, files);
  files.sort();

  const allowlist = new Set(ALLOWLIST);

  for (const relPath of files) {
    const normalized = relPath.split(path.sep).join('/');
    if (allowlist.has(normalized)) continue;
    const absPath = path.join(CONTENT_ROOT, relPath);
    const content = await readFile(absPath, 'utf8');
    const lines = content.split('\n');
    for (const [index, line] of lines.entries()) {
      if (line.includes(FORBIDDEN_PATTERN)) {
        violations.push({ file: normalized, line: index + 1, text: line.trim() });
      }
    }
  }
  return violations;
}

function formatViolations(violations: ReadonlyArray<Violation>): string {
  if (violations.length === 0) return '';
  const header =
    `Found ${violations.length} raw \`${FORBIDDEN_PATTERN}\` reference(s) in installable Markdown. ` +
    `Replace each with one of: ` +
    `(a) \`{harness_home_dir}/...\` for runtime references the agent reads or executes; ` +
    `(b) a relative Markdown link \`[text](relative/path.md)\` (the install pipeline rewrites it); ` +
    `(c) add the file to the ALLOWLIST in this test if the reference is an intentional source-tree citation. ` +
    `See \`packages/agents/content/_partials/README.md\` § "Path references in installed content" for the convention.`;
  const lines = violations.map((v) => `  ${v.file}:${v.line}: ${v.text}`);
  return [header, ...lines].join('\n');
}

// endregion | Helpers
