// Shared wikilink-scanning primitives. Both the `wikilinks` rule (detection) and the kb-curate skill's
// path-rewrite sweep (remediation) import these, so the two never diverge on what counts as a link.

/**
 * Match `[[Target]]` and `![[Target]]` (embeds). A backslash-escaped `\[[…]]` is excluded. Scan the body so that
 * frontmatter wikilink-looking text (e.g. inside a description) is not flagged.
 */
export const WIKILINK = /(?<!\\)!?\[\[([^\]\n]+?)\]\]/g;

/**
 * Common non-Markdown extensions that appear in Obsidian embeds. Skipped from validation because the vault index
 * only knows about `.md` files.
 */
const NON_MD_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.pdf',
  '.mp3',
  '.mp4',
  '.mov',
  '.wav',
]);

/**
 * Strips `|alias` and `#anchor` from a wikilink inner string and returns the target. Returns `null` for intra-doc
 * links like `[[#heading]]`, which carry no target.
 */
export function extractTarget(inner: string): string | null {
  const beforeAlias = inner.split('|', 1)[0] ?? '';
  const beforeAnchor = beforeAlias.split('#', 1)[0] ?? '';
  const trimmed = beforeAnchor.trim();
  return trimmed === '' ? null : trimmed;
}

/** Whether a target carries a known non-Markdown extension (an embed the vault index cannot resolve). */
export function hasNonMarkdownExtension(target: string): boolean {
  const dotIndex = target.lastIndexOf('.');
  if (dotIndex === -1) return false;
  const ext = target.slice(dotIndex).toLowerCase();
  if (ext === '.md') return false;
  return NON_MD_EXTENSIONS.has(ext);
}

/** Reduces a wikilink target to the basename key the vault index is keyed on (drops any directory prefix and `.md`). */
export function lookupKey(target: string): string {
  const withoutExtension = target.endsWith('.md') ? target.slice(0, -3) : target;
  const segments = withoutExtension.split('/');
  return segments.at(-1) ?? withoutExtension;
}

/** Counts the newlines in `text` before byte offset `upTo`, used to locate a match's source line. */
export function countNewlines(text: string, upTo: number): number {
  let count = 0;
  for (let index = 0; index < upTo && index < text.length; index += 1) {
    if (text[index] === '\n') count += 1;
  }
  return count;
}

/**
 * Replaces inline backtick spans (e.g., TOML `[[plugins]]` mentioned in prose) with same-length whitespace so
 * wikilink-shaped text inside inline code is not flagged. Matches single or multi-backtick runs whose content
 * contains no backticks or newlines — the common case; complex spans with embedded backticks fall through and are
 * still parsed for wikilinks.
 */
export function maskInlineCode(body: string): string {
  return body.replace(/`+[^`\n]+?`+/g, (match) => ' '.repeat(match.length));
}

/**
 * Replaces the content of fenced code blocks with spaces so wikilink-shaped text inside code (e.g., a bash
 * `[[ -n "$x" ]]` conditional) is not flagged. Offsets and line counts are preserved by substituting same-length
 * whitespace.
 */
export function maskFencedCode(body: string): string {
  const lines = body.split('\n');
  let inFence = false;
  let fenceChar = '';
  let fenceLength = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const fenceMatch = line.match(FENCE_LINE);
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? '';
      const char = marker[0] ?? '';
      if (!inFence) {
        inFence = true;
        fenceChar = char;
        fenceLength = marker.length;
        continue;
      }
      if (char === fenceChar && marker.length >= fenceLength) {
        inFence = false;
        fenceChar = '';
        fenceLength = 0;
        continue;
      }
    }
    if (inFence) lines[index] = ' '.repeat(line.length);
  }
  return lines.join('\n');
}

const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})/;
