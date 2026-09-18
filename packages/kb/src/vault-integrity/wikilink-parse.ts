/**
 * Matches `[[Target]]` and `![[Target]]` (embeds). A backslash-escaped `\[[…]]` is excluded. The scan covers the body
 * alone so that frontmatter wikilink-looking text (e.g. inside a description) is not flagged.
 */
const WIKILINK = /(?<!\\)!?\[\[([^\]\n]+?)\]\]/g;

/**
 * Common non-Markdown extensions that appear in Obsidian embeds. Skipped from validation because the vault index
 * contains only `.md` files.
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

/** Counts the newlines in `text` before string index `upTo`, used to locate a match's source line. */
export function countNewlines(text: string, upTo: number): number {
  let count = 0;
  for (let index = 0; index < upTo && index < text.length; index += 1) {
    if (text[index] === '\n') count += 1;
  }
  return count;
}

/**
 * Strips `|alias` and `#anchor` from a wikilink inner string and returns the target. Returns `null` for intra-doc
 * links like `[[#heading]]`, which have no target.
 */
export function extractTarget(inner: string): string | null {
  const beforeAlias = inner.split('|', 1)[0] ?? '';
  const beforeAnchor = beforeAlias.split('#', 1)[0] ?? '';
  const trimmed = beforeAnchor.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Reduces a wikilink target to the basename key on which the vault index is keyed (drops any directory prefix and
 * `.md`).
 */
export function lookupKey(target: string): string {
  const withoutExtension = target.endsWith('.md') ? target.slice(0, -3) : target;
  const segments = withoutExtension.split('/');
  return segments.at(-1) ?? withoutExtension;
}

/** A wikilink target separated into the store that it names, when it names one, and the target within that store. */
export interface QualifiedTarget {
  /** The store named by the link, or `undefined` when the target is store-local. */
  store?: string;
  /** The target with any store qualifier removed. */
  target: string;
}

/**
 * One wikilink accepted by a body scan, with its target already split into an optional store qualifier and a target.
 */
export interface ScannedWikilink {
  /** The whole matched link, including any `!` embed prefix. */
  match: string;
  /** The text between the brackets, with alias and anchor intact. */
  inner: string;
  /** Offset of the match within the body. */
  offset: number;
  /** The store named by the link, or `undefined` when the target is store-local. */
  store?: string;
  /** The target within that store, with alias, anchor, and any store qualifier stripped. */
  target: string;
}

/**
 * Scans a note body and yields every wikilink that has a resolvable target: fenced and inline code are masked
 * first, and backslash-escaped links, intra-doc anchors, and non-Markdown embeds are skipped. This is the single
 * definition of what counts as a link and what its target is, so a consumer that detects links and one that rewrites
 * them cannot drift apart on either question.
 *
 * `offset` indexes the body as passed in. Because masking substitutes same-length whitespace, which this function
 * asserts, a consumer may slice the unmasked body at the offsets yielded here. It also leaves every newline where it
 * was, which lets a consumer count lines in the unmasked body at those offsets. Nothing asserts that at runtime, so a
 * masker that moved a newline while keeping the length would shift reported line numbers rather than fail.
 */
export function* scanWikilinks(body: string): Generator<ScannedWikilink> {
  const masked = maskInlineCode(maskFencedCode(body));
  if (masked.length !== body.length) {
    throw new Error('code masking changed body length; wikilink offsets would be invalid');
  }

  for (const match of masked.matchAll(WIKILINK)) {
    const inner = match[1];
    if (inner === undefined) continue;
    const extracted = extractTarget(inner);
    if (extracted === null) continue;
    if (hasNonMarkdownExtension(extracted)) continue;

    const { store, target } = splitStoreQualifier(extracted);
    yield { match: match[0], inner, offset: match.index, ...(store !== undefined && { store }), target };
  }
}

/**
 * Separates a leading `store:` qualifier from a wikilink target: `fde:Note title` names the note `Note title` in the
 * store `fde`. A qualifier is recognized only when the text before the first colon is non-empty and contains no
 * whitespace and no `/`, and something follows the colon. Every other target stays store-local: A title such as
 * `Release notes: v2` resolves within this store.
 *
 * Call it on the output of {@link extractTarget}, which has already stripped any alias and anchor.
 */
export function splitStoreQualifier(target: string): QualifiedTarget {
  const colonIndex = target.indexOf(':');
  if (colonIndex <= 0) return { target };

  const store = target.slice(0, colonIndex);
  const remainder = target.slice(colonIndex + 1);
  if (remainder === '' || /[\s/]/.test(store)) return { target };

  return { store, target: remainder };
}

// region | Helpers

/** Whether a target has a known non-Markdown extension (an embed that the vault index cannot resolve). */
function hasNonMarkdownExtension(target: string): boolean {
  const dotIndex = target.lastIndexOf('.');
  if (dotIndex === -1) return false;
  const ext = target.slice(dotIndex).toLowerCase();
  if (ext === '.md') return false;
  return NON_MD_EXTENSIONS.has(ext);
}

/**
 * Replaces the content of fenced code blocks with spaces so that wikilink-shaped text inside code (e.g., a bash
 * `[[ -n "$x" ]]` conditional) is not flagged. Offsets and line counts are preserved by substituting same-length
 * whitespace.
 */
function maskFencedCode(body: string): string {
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

/**
 * Replaces inline backtick spans (e.g., TOML `[[plugins]]` mentioned in prose) with same-length whitespace so that
 * wikilink-shaped text inside inline code is not flagged. Matches single or multi-backtick runs whose content
 * contains no backticks or newlines (the common case); complex spans with embedded backticks fall through and are
 * still parsed for wikilinks.
 */
function maskInlineCode(body: string): string {
  return body.replace(/`+[^`\n]+?`+/g, (match) => ' '.repeat(match.length));
}

const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})/;

// endregion | Helpers
