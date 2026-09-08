import { lookupKey, type ScannedWikilink, scanWikilinks, type VaultIndex } from '@williamthorsen/kb/vault-integrity';

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
 * A link is a rewrite candidate iff it is **store-local**, **path-qualified** (its target contains a `/`), its
 * basename resolves to **exactly one** vault note (`index.size === 1`), and the written target differs from that
 * note's canonical vault-relative path (sans `.md`). Only stale path prefixes are repaired: a bare-basename link that
 * resolves uniquely (e.g. `[[Foo]]`) is left untouched, because it is a valid link the `wikilinks` rule emits no
 * finding for — rewriting it would mutate links the report never flagged and flip a bare-basename vault's link style
 * en masse. A store-qualified link (`[[fde:notes/Title]]`) names a note in another store, which this vault's index
 * cannot speak for, so it is never rewritten. The rewrite preserves any `|alias`, `#anchor`, and the embed (`!`)
 * prefix, and keeps the path-qualified style (it does not strip to a bare basename). Unresolved (zero matches) and
 * ambiguous (multiple matches) links are never rewritten. Links inside fenced or inline code are skipped, because
 * detection and remediation read the same {@link scanWikilinks} walk.
 */
export function rewriteWikilinks(input: { body: string; vaultIndex: VaultIndex }): RewriteResult {
  const { body, vaultIndex } = input;
  const rewrites: Array<{ from: string; to: string }> = [];

  let result = '';
  let lastIndex = 0;
  for (const link of scanWikilinks(body)) {
    const replacement = rewriteLink({ link, vaultIndex });
    if (replacement === null) continue;

    result += body.slice(lastIndex, link.offset) + replacement.text;
    lastIndex = link.offset + link.match.length;
    rewrites.push({ from: replacement.from, to: replacement.to });
  }
  result += body.slice(lastIndex);

  return { body: rewrites.length > 0 ? result : body, changed: rewrites.length > 0, rewrites };
}

// region | Helpers

/** Computes the replacement for a single scanned link, or `null` when it is not a rewrite candidate. */
function rewriteLink(input: {
  link: ScannedWikilink;
  vaultIndex: VaultIndex;
}): { text: string; from: string; to: string } | null {
  const { link, vaultIndex } = input;
  if (link.store !== undefined) {
    return null;
  }
  // Only repair stale path prefixes. A bare basename (no `/`) that resolves uniquely is a valid link the
  // `wikilinks` rule never flags, so leave it alone rather than path-qualifying links the report never surfaced.
  if (!link.target.includes('/')) {
    return null;
  }
  const resolved = vaultIndex.get(lookupKey(link.target));
  if (resolved === undefined || resolved.size !== 1) {
    return null;
  }
  const [onlyPath] = resolved;
  if (onlyPath === undefined) {
    return null;
  }
  const canonical = onlyPath.replace(/\.md$/, '');
  if (canonical === link.target) {
    return null;
  }

  const { alias, anchor } = splitDecorations(link.inner);
  const embedPrefix = link.match.startsWith('!') ? '!' : '';
  return { text: `${embedPrefix}[[${canonical}${anchor}${alias}]]`, from: link.target, to: canonical };
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
