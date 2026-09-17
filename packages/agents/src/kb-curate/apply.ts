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
 * Performs the two mechanically safe fixes for a `--apply` run, tag canonicalization then path-only wikilink
 * rewrites, and returns one {@link AppliedFix} per attempted fix. A failing fix is recorded and the run continues.
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
  // Index on vault-relative paths, because a rewritten link names the note's relative target; the detection index
  // keys on absolute paths.
  const vaultIndex = buildVaultIndex(input.notes.map((entry) => ({ path: entry.relativePath })));
  const fixes: AppliedFix[] = [];
  for (const entry of input.notes) {
    const result = rewriteWikilinks({ body: entry.body, vaultIndex });
    if (!result.changed) continue;
    // Re-read the current on-disk content: a tag fix earlier in this run rewrote the frontmatter, and a write built
    // from the enumeration snapshot would revert it. The tag fix leaves the body alone, so the snapshot's body still
    // anchors the replacement.
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
 * Rebuilds a note's full content with a rewritten body. `content` is the current on-disk content and the body is its
 * suffix after the frontmatter block, so replacing the final occurrence preserves the on-disk frontmatter verbatim.
 * Returns `null` when `oldBody` is absent from `content`, leaving no safe splice point.
 */
function replaceBody(content: string, oldBody: string, newBody: string): string | null {
  const bodyStart = content.lastIndexOf(oldBody);
  if (bodyStart === -1) {
    return null;
  }
  return content.slice(0, bodyStart) + newBody + content.slice(bodyStart + oldBody.length);
}

// endregion | Helpers
