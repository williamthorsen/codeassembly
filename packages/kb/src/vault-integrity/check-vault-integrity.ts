import type { Finding } from '../types.ts';
import { buildVaultIndex, type VaultIndex } from './build-vault-index.ts';
import {
  countNewlines,
  extractTarget,
  hasNonMarkdownExtension,
  lookupKey,
  maskFencedCode,
  maskInlineCode,
  WIKILINK,
} from './wikilink-parse.ts';

/** A note reduced to what vault integrity inspects: its path, its body, and the file line the body begins on. */
export interface VaultIntegrityNote {
  /** Path or label the note was read from; used as the index value and the finding path. */
  path: string;
  /** The note body (everything after the frontmatter block). */
  body: string;
  /** 1-based file line where the body begins, so link findings report file-absolute lines. */
  bodyStartLine: number;
}

/**
 * Checks whole-vault integrity over a type-blind note set: unresolved `[[link]]` targets and basename collisions.
 * Projects no records and reads no frontmatter — a note is just its path and body.
 *
 * A `[[Target]]` whose basename resolves to zero notes is an error (`wikilinks.unresolved`), reported at its
 * file-absolute line. A basename shared by two or more notes is a single vault-wide warning (`wikilinks.basename`),
 * reported once per basename independent of whether any link references it. An ambiguous link (a basename that several
 * notes share) is not flagged per-link — the vault-wide basename warning subsumes it.
 */
export function checkVaultIntegrity(notes: readonly VaultIntegrityNote[]): Finding[] {
  const vaultIndex = buildVaultIndex(notes);
  return [...unresolvedLinkFindings(notes, vaultIndex), ...basenameFindings(vaultIndex)];
}

// region | Helpers

/** Emits one warning per basename shared by two or more notes, listing the colliding paths in sorted order. */
function basenameFindings(vaultIndex: VaultIndex): Finding[] {
  const findings: Finding[] = [];
  for (const key of vaultIndex.keys().toArray().toSorted()) {
    const paths = vaultIndex.get(key);
    if (paths === undefined || paths.size < 2) continue;
    const sortedPaths = [...paths].toSorted();
    findings.push({
      path: sortedPaths[0] ?? key,
      rule: 'wikilinks.basename',
      severity: 'warning',
      message: `basename "${key}" is shared by ${sortedPaths.length} notes: ${sortedPaths.join(', ')}`,
    });
  }
  return findings;
}

/**
 * Flags every `[[Target]]` whose basename resolves to no vault note, reported at its file-absolute line. The body is
 * masked for fenced and inline code before scanning so wikilink-shaped text inside code is not flagged;
 * backslash-escaped links, intra-doc anchors, and non-Markdown embeds are skipped.
 */
function unresolvedLinkFindings(notes: readonly VaultIntegrityNote[], vaultIndex: VaultIndex): Finding[] {
  const findings: Finding[] = [];
  for (const note of notes) {
    const body = maskInlineCode(maskFencedCode(note.body));
    for (const match of body.matchAll(WIKILINK)) {
      const inner = match[1];
      if (inner === undefined) continue;
      const target = extractTarget(inner);
      if (target === null) continue;
      if (hasNonMarkdownExtension(target)) continue;
      const resolved = vaultIndex.get(lookupKey(target));
      if (resolved !== undefined && resolved.size > 0) continue;
      findings.push({
        path: note.path,
        line: note.bodyStartLine + countNewlines(body, match.index),
        rule: 'wikilinks.unresolved',
        severity: 'error',
        message: `[[${target}]] does not resolve to any vault note`,
      });
    }
  }
  return findings;
}

// endregion | Helpers
