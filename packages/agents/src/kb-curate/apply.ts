import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

import type { Finding, VaultIndex } from '@codeassembly/kb-core';

import { canonicalizeTags } from './apply/canonicalize-tags.ts';
import { rewriteWikilinks } from './apply/rewrite-wikilinks.ts';
import type { EnumeratedNote } from './enumerate.ts';
import type { AppliedFix } from './types.ts';

/**
 * Performs the two mechanically safe fixes for a `--apply` run and returns one {@link AppliedFix} per attempted fix:
 *
 * - **Tag canonicalization** — for each note that produced a `frontmatter.tag-alias` finding, delegate to `kb-edit
 *   --retag` (subprocess) once, so `kb-edit` stays the sole writer of frontmatter. A single failure does not abort
 *   the run.
 * - **Path-only wikilink rewrites** — sweep every note body, rewriting stale path-qualified links whose basename
 *   resolves to exactly one note. These touch the body, not the frontmatter, so they are written inline.
 *
 * Returns the fixes in tag-then-wikilink order. The vault index for the rewrite sweep is built from the enumerated
 * notes' paths.
 */
export async function applyFixes(input: {
  kbPath: string;
  notes: readonly EnumeratedNote[];
  findings: readonly Finding[];
}): Promise<AppliedFix[]> {
  const tagFixes = await canonicalizeAffectedNotes(input);
  const linkFixes = await rewriteStalePathLinks(input);
  return [...tagFixes, ...linkFixes];
}

// region | Helpers

/** Runs `kb-edit --retag` once per note that has a `frontmatter.tag-alias` finding, in vault order. */
async function canonicalizeAffectedNotes(input: {
  notes: readonly EnumeratedNote[];
  findings: readonly Finding[];
}): Promise<AppliedFix[]> {
  const affectedPaths = new Set(
    input.findings.filter((finding) => finding.rule === 'frontmatter.tag-alias').map((finding) => finding.path),
  );
  const fixes: AppliedFix[] = [];
  for (const entry of input.notes) {
    if (!affectedPaths.has(entry.note.path)) continue;
    const currentTags = entry.note.frontmatter?.tags ?? [];
    fixes.push(await canonicalizeTags({ notePath: entry.note.path, currentTags }));
  }
  return fixes;
}

/** Sweeps every note body for stale path-qualified wikilinks and rewrites them inline, in vault order. */
async function rewriteStalePathLinks(input: { notes: readonly EnumeratedNote[] }): Promise<AppliedFix[]> {
  const vaultIndex = buildRelativeIndex(input.notes);
  const fixes: AppliedFix[] = [];
  for (const entry of input.notes) {
    const result = rewriteWikilinks({ body: entry.note.body, vaultIndex });
    if (!result.changed) continue;
    const newContent = replaceBody(entry.note.content, entry.note.body, result.body);
    try {
      await writeFile(entry.note.path, newContent, 'utf8');
      fixes.push({
        path: entry.note.path,
        rule: 'wikilinks.path-rewrite',
        ok: true,
        operation: 'rewrite-wikilink',
        message: result.rewrites.map((rewrite) => `[[${rewrite.from}]] → [[${rewrite.to}]]`).join('; '),
      });
    } catch (error) {
      fixes.push({
        path: entry.note.path,
        rule: 'wikilinks.path-rewrite',
        ok: false,
        operation: 'rewrite-wikilink',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return fixes;
}

/**
 * Builds a basename → vault-relative-paths index over the enumerated notes. The rewrite sweep resolves a link's
 * basename here and rewrites to the matching note's vault-relative path, so the index values must be the relative
 * paths (not the absolute paths the detection index keys on).
 */
function buildRelativeIndex(notes: readonly EnumeratedNote[]): VaultIndex {
  const index = new Map<string, Set<string>>();
  for (const entry of notes) {
    const key = basename(entry.relativePath).replace(/\.md$/, '');
    let set = index.get(key);
    if (set === undefined) {
      set = new Set();
      index.set(key, set);
    }
    set.add(entry.relativePath);
  }
  return index;
}

/**
 * Rebuilds a note's full content with a rewritten body. The body is the suffix of `content` after the frontmatter
 * block; replacing the final occurrence preserves the frontmatter verbatim (the rewrite never touches the
 * frontmatter, and a note body cannot precede its own frontmatter).
 */
function replaceBody(content: string, oldBody: string, newBody: string): string {
  const bodyStart = content.lastIndexOf(oldBody);
  if (bodyStart === -1) {
    return newBody;
  }
  return content.slice(0, bodyStart) + newBody + content.slice(bodyStart + oldBody.length);
}

// endregion | Helpers
