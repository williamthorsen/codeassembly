import { readFile, writeFile } from 'node:fs/promises';

import type { Finding } from '@williamthorsen/kb';
import type { EnumeratedNote } from '@williamthorsen/kb/check';
import { asStringList } from '@williamthorsen/kb/note-io';
import { buildVaultIndex } from '@williamthorsen/kb/vault-integrity';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { canonicalizeTags } from './apply/canonicalize-tags.ts';
import { rewriteWikilinks } from './apply/rewrite-wikilinks.ts';
import type { AppliedFix } from './types.ts';

/**
 * Performs the two mechanically safe fixes for a `--apply` run and returns one {@link AppliedFix} per attempted fix:
 *
 * - **Tag canonicalization** — for each note that produced a `tag-alias` finding, delegate to `kb-edit --retag`
 *   (subprocess) once, so `kb-edit` stays the sole writer of frontmatter. A single failure does not abort the run.
 * - **Path-only wikilink rewrites** — sweep every note body, rewriting stale path-qualified links whose basename
 *   resolves to exactly one note. These touch the body, not the frontmatter, so they are written inline.
 *
 * Returns the fixes in tag-then-wikilink order. The vault index for the rewrite sweep is built from the enumerated
 * notes' paths. The inline writer re-reads each note from disk immediately before rewriting, so when a note has both
 * fixes the tag canonicalization that ran first (and rewrote the frontmatter on disk) is preserved rather than
 * clobbered by the stale enumeration snapshot.
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

/** Runs `kb-edit --retag` once per note that has a `tag-alias` finding, in vault order. */
async function canonicalizeAffectedNotes(input: {
  notes: readonly EnumeratedNote[];
  findings: readonly Finding[];
}): Promise<AppliedFix[]> {
  const affectedPaths = new Set(
    input.findings.filter((finding) => finding.rule === 'tag-alias').map((finding) => finding.path),
  );
  const fixes: AppliedFix[] = [];
  for (const entry of input.notes) {
    if (!affectedPaths.has(entry.path)) continue;
    const currentTags = asStringList(entry.fields.tags) ?? [];
    fixes.push(await canonicalizeTags({ notePath: entry.path, currentTags }));
  }
  return fixes;
}

/** Sweeps every note body for stale path-qualified wikilinks and rewrites them inline, in vault order. */
async function rewriteStalePathLinks(input: { notes: readonly EnumeratedNote[] }): Promise<AppliedFix[]> {
  // Index on vault-relative paths so a rewrite resolves a link to a note's relative target, not the absolute path
  // the detection index keys on.
  const vaultIndex = buildVaultIndex(input.notes.map((entry) => ({ path: entry.relativePath })));
  const fixes: AppliedFix[] = [];
  for (const entry of input.notes) {
    const result = rewriteWikilinks({ body: entry.body, vaultIndex });
    if (!result.changed) continue;
    // Re-read current on-disk content rather than splicing into the enumeration snapshot: a tag fix that ran
    // earlier in this run rewrote the frontmatter on disk, and writing from the stale snapshot would silently
    // revert it. The body is untouched by the tag fix, so the snapshot's body still anchors the replacement.
    let currentContent: string;
    try {
      currentContent = await readFile(entry.path, 'utf8');
    } catch (error) {
      fixes.push({
        path: entry.path,
        rule: 'wikilinks.path-rewrite',
        ok: false,
        operation: 'rewrite-wikilink',
        message: describeError(error),
      });
      continue;
    }
    const newContent = replaceBody(currentContent, entry.body, result.body);
    if (newContent === null) {
      fixes.push({
        path: entry.path,
        rule: 'wikilinks.path-rewrite',
        ok: false,
        operation: 'rewrite-wikilink',
        message: 'body anchor not found in note content; skipping rewrite to avoid frontmatter loss',
      });
      continue;
    }
    try {
      await writeFile(entry.path, newContent, 'utf8');
      fixes.push({
        path: entry.path,
        rule: 'wikilinks.path-rewrite',
        ok: true,
        operation: 'rewrite-wikilink',
        message: result.rewrites.map((rewrite) => `[[${rewrite.from}]] → [[${rewrite.to}]]`).join('; '),
      });
    } catch (error) {
      fixes.push({
        path: entry.path,
        rule: 'wikilinks.path-rewrite',
        ok: false,
        operation: 'rewrite-wikilink',
        message: describeError(error),
      });
    }
  }
  return fixes;
}

/**
 * Rebuilds a note's full content with a rewritten body. `content` is the current on-disk content; the body is its
 * suffix after the frontmatter block, so replacing the final occurrence preserves whatever frontmatter is currently
 * on disk verbatim (including a tag canonicalization applied earlier this run). Returns `null` when `oldBody` is not
 * found verbatim in `content`, so the caller skips the write rather than persisting a frontmatter-stripped file.
 */
function replaceBody(content: string, oldBody: string, newBody: string): string | null {
  const bodyStart = content.lastIndexOf(oldBody);
  if (bodyStart === -1) {
    return null;
  }
  return content.slice(0, bodyStart) + newBody + content.slice(bodyStart + oldBody.length);
}

// endregion | Helpers
