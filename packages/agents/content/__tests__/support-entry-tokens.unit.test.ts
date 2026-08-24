import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { extractInvocationEdges } from '../../src/lib/invocation-tokens.ts';
import { enumerateCatalogSlugs, listSupportEntries } from '../../src/lib/library-catalog.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// A `{skill:<slug>}` token renders wherever a support entry does, but only a skill's or subagent's own include-expanded
// body contributes dependency edges. A support entry is reached by a link rather than inlined, so `dependency-resolver`
// never reads it and `validate` never resolves what its tokens name: a token naming an artifact that does not exist
// ships as a rendered sigil the agent follows to nothing. Resolving them against the catalog turns that into a failure.
//
// `{rulebook:<slug>}` is out of scope. The render pass rejects one in a support entry outright, since `install` ships
// such an entry having resolved no declaration to render it against.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;
const SKILLS_ROOT = path.join(CONTENT_ROOT, 'skills');

describe('support entry invocation tokens', () => {
  it('name artifacts the library contains', async () => {
    const catalog = await enumerateCatalogSlugs(CONTENT_ROOT);
    const skills = new Set(catalog.skill ?? []);
    const subagents = new Set(catalog.subagent ?? []);
    const violations: Array<string> = [];

    for (const file of await listSupportEntryFiles()) {
      const edges = extractInvocationEdges(await readFile(file, 'utf8'));
      const relative = path.relative(CONTENT_ROOT, file);
      for (const slug of edges.skills) {
        if (!skills.has(slug)) {
          violations.push(`${relative} -> {skill:${slug}}`);
        }
      }
      for (const slug of edges.subagents) {
        if (!subagents.has(slug)) {
          violations.push(`${relative} -> {subagent:${slug}}`);
        }
      }
    }

    const message =
      'A support entry carries an invocation token naming an artifact the library does not contain. Nothing else ' +
      `resolves a support entry's tokens, so it ships as a rendered pointer to nothing:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });

  // The assertion above only ever reports what it fails to find, so a walk that silently returned nothing would leave
  // the suite green and the guard gone. This pins the walk against an entry reached only by link.
  it('reaches a support entry reached only by link', async () => {
    const files = (await listSupportEntryFiles()).map((file) => path.relative(CONTENT_ROOT, file));

    expect(files).toContain('skills/_data/ticket-source-resolution.md');
  });
});

// region | Helpers

/** Lists every Markdown file under `skills/` that ships as a support entry rather than as part of a skill. */
async function listSupportEntryFiles(): Promise<ReadonlyArray<string>> {
  const files: Array<string> = [];
  for (const entry of await listSupportEntries(SKILLS_ROOT)) {
    const target = path.join(SKILLS_ROOT, entry);
    files.push(...(target.endsWith('.md') ? [target] : await listMarkdownFiles(target)));
  }
  return files;
}

// endregion | Helpers
