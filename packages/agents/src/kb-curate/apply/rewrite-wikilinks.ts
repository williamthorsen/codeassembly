import type { VaultIndex } from '@codeassembly/kb-core';
import {
  extractTarget,
  hasNonMarkdownExtension,
  lookupKey,
  maskFencedCode,
  maskInlineCode,
  WIKILINK,
} from '@codeassembly/kb-core/rules';

/** The result of sweeping one note's body for stale path-qualified wikilinks. */
export interface RewriteResult {
  /** The rewritten body, identical to the input when no link changed. */
  body: string;
  /** Whether any link was rewritten. */
  changed: boolean;
  /** One entry per link rewritten, naming the stale and canonical targets. */
  rewrites: Array<{ from: string; to: string }>;
}

/**
 * Rewrites path-only stale wikilinks in a note body to the canonical vault-relative target.
 *
 * A link is a rewrite candidate iff its basename resolves to **exactly one** vault note (`index.size === 1`) and the
 * written target differs from that note's canonical vault-relative path (sans `.md`). The rewrite preserves any
 * `|alias`, `#anchor`, and the embed (`!`) prefix, and keeps the path-qualified style (it does not strip to a bare
 * basename). Unresolved (zero matches) and ambiguous (multiple matches) links are never rewritten. Links inside
 * fenced or inline code are skipped, using the same masking the `wikilinks` rule uses so detection and remediation
 * never diverge on what counts as a link.
 */
export function rewriteWikilinks(input: { body: string; vaultIndex: VaultIndex }): RewriteResult {
  const { body, vaultIndex } = input;
  const masked = maskInlineCode(maskFencedCode(body));
  // The splice loop derives offsets from `masked` but applies them to `body`, which is only sound while masking is
  // a same-length substitution. Guard the invariant so a future masking change that alters length fails loudly
  // rather than silently corrupting bodies.
  if (masked.length !== body.length) {
    throw new Error('code masking changed body length; wikilink rewrite offsets would be invalid');
  }
  const rewrites: Array<{ from: string; to: string }> = [];

  // Walk matches on the masked body to decide rewritability, but splice replacements into the original body so the
  // surrounding text (including code spans, which are only masked for detection) is preserved verbatim.
  let result = '';
  let lastIndex = 0;
  for (const match of masked.matchAll(WIKILINK)) {
    const fullMatch = match[0];
    const inner = match[1];
    const start = match.index;
    const end = start + fullMatch.length;
    if (inner === undefined) continue;

    const replacement = rewriteLink({ fullMatch, inner, vaultIndex });
    if (replacement === null) continue;

    result += body.slice(lastIndex, start) + replacement.text;
    lastIndex = end;
    rewrites.push({ from: replacement.from, to: replacement.to });
  }
  result += body.slice(lastIndex);

  return { body: rewrites.length > 0 ? result : body, changed: rewrites.length > 0, rewrites };
}

// region | Helpers

/** Computes the replacement for a single matched link, or `null` when it is not a rewrite candidate. */
function rewriteLink(input: {
  fullMatch: string;
  inner: string;
  vaultIndex: VaultIndex;
}): { text: string; from: string; to: string } | null {
  const { fullMatch, inner, vaultIndex } = input;
  const target = extractTarget(inner);
  if (target === null || hasNonMarkdownExtension(target)) {
    return null;
  }
  const resolved = vaultIndex.get(lookupKey(target));
  if (resolved === undefined || resolved.size !== 1) {
    return null;
  }
  const [onlyPath] = resolved;
  if (onlyPath === undefined) {
    return null;
  }
  const canonical = onlyPath.replace(/\.md$/, '');
  if (canonical === target) {
    return null;
  }

  const { alias, anchor } = splitDecorations(inner);
  const embedPrefix = fullMatch.startsWith('!') ? '!' : '';
  const rebuiltInner = `${canonical}${anchor}${alias}`;
  return { text: `${embedPrefix}[[${rebuiltInner}]]`, from: target, to: canonical };
}

/** Splits a wikilink inner string into its `#anchor` and `|alias` decorations, preserving the original separators. */
function splitDecorations(inner: string): { alias: string; anchor: string } {
  const aliasIndex = inner.indexOf('|');
  const alias = aliasIndex === -1 ? '' : inner.slice(aliasIndex);
  const beforeAlias = aliasIndex === -1 ? inner : inner.slice(0, aliasIndex);
  const anchorIndex = beforeAlias.indexOf('#');
  const anchor = anchorIndex === -1 ? '' : beforeAlias.slice(anchorIndex);
  return { alias, anchor };
}

// endregion | Helpers
