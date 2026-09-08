import type { StoreVisibility } from '../config/config-schema.ts';
import type { Finding } from '../types.ts';
import { buildVaultIndex, type VaultIndex } from './build-vault-index.ts';
import {
  countNewlines,
  extractTarget,
  hasNonMarkdownExtension,
  lookupKey,
  maskFencedCode,
  maskInlineCode,
  splitStoreQualifier,
  WIKILINK,
} from './wikilink-parse.ts';

/**
 * Checks whole-vault integrity over a type-blind note set: unresolved `[[link]]` targets and basename collisions.
 * Projects no records and reads no frontmatter — a note is just its path and body.
 *
 * A `[[Target]]` whose basename resolves to zero notes is an error (`wikilinks.unresolved`), reported at its
 * file-absolute line. A basename shared by two or more notes is a single vault-wide warning (`wikilinks.basename`),
 * reported once per basename independent of whether any link references it. An ambiguous link (a basename that several
 * notes share) is not flagged per-link — the vault-wide basename warning subsumes it.
 *
 * A `[[store:Target]]` resolves against `options.foreignStores` instead, and never joins this store's own basename
 * index, so the basename warning stays store-scoped. Without `options`, a qualified target is treated as a bare one,
 * which is the behavior every caller had before cross-store resolution existed.
 */
export function checkVaultIntegrity(notes: readonly VaultIntegrityNote[], options?: VaultIntegrityOptions): Finding[] {
  const vaultIndex = buildVaultIndex(notes);
  return [...linkFindings(notes, vaultIndex, options), ...basenameFindings(vaultIndex)];
}

/** What a check run found when it looked up a store one of its links names. */
export type ForeignStore =
  /** The name matches no entry in the merged registry. */
  | { status: 'unknown' }
  /** The store is registered but cannot be read on this machine, so its links are unverifiable rather than broken. */
  | { status: 'unavailable'; reason: string }
  /** The store is less shareable than the source, so a link into it would widen disclosure. */
  | { status: 'disallowed'; visibility: StoreVisibility }
  /** The store was read; `index` holds its basenames. */
  | { status: 'resolved'; index: VaultIndex };

/** A note reduced to what vault integrity inspects: its path, its body, and the file line the body begins on. */
export interface VaultIntegrityNote {
  /** Path or label the note was read from; used as the index value and the finding path. */
  path: string;
  /** The note body (everything after the frontmatter block). */
  body: string;
  /** 1-based file line where the body begins, so link findings report file-absolute lines. */
  bodyStartLine: number;
}

/** What a run needs to evaluate a store-qualified link. */
export interface VaultIntegrityOptions {
  /** What the run found for each store name its links qualify, keyed by that name. */
  foreignStores: ReadonlyMap<string, ForeignStore>;
  /** The visibility of the store being checked, which decides the direction a qualified link may take. */
  sourceVisibility: StoreVisibility;
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
 * Flags every `[[Target]]` that resolves to no note, reported at its file-absolute line. The body is masked for fenced
 * and inline code before scanning so wikilink-shaped text inside code is not flagged; backslash-escaped links,
 * intra-doc anchors, and non-Markdown embeds are skipped.
 */
function linkFindings(
  notes: readonly VaultIntegrityNote[],
  vaultIndex: VaultIndex,
  options: VaultIntegrityOptions | undefined,
): Finding[] {
  const findings: Finding[] = [];
  for (const note of notes) {
    const body = maskInlineCode(maskFencedCode(note.body));
    for (const match of body.matchAll(WIKILINK)) {
      const inner = match[1];
      if (inner === undefined) continue;
      const target = extractTarget(inner);
      if (target === null) continue;
      if (hasNonMarkdownExtension(target)) continue;

      const { store, target: bare } =
        options === undefined ? { store: undefined, target } : splitStoreQualifier(target);
      const defect =
        store === undefined || options === undefined
          ? describeLocalDefect(bare, vaultIndex)
          : describeForeignDefect(store, bare, options);
      if (defect === undefined) continue;

      findings.push({
        path: note.path,
        line: note.bodyStartLine + countNewlines(body, match.index),
        ...defect,
      });
    }
  }
  return findings;
}

/** Describes why a store-qualified link failed to resolve, or `undefined` when it resolved. */
function describeForeignDefect(
  store: string,
  target: string,
  options: VaultIntegrityOptions,
): Pick<Finding, 'rule' | 'severity' | 'message'> | undefined {
  const link = `[[${store}:${target}]]`;
  const foreignStore = options.foreignStores.get(store);
  if (foreignStore === undefined || foreignStore.status === 'unknown') {
    return {
      rule: 'wikilinks.unknown-store',
      severity: 'error',
      message: `${link} names the store "${store}", which no kb.yaml registry entry declares`,
    };
  }
  if (foreignStore.status === 'unavailable') {
    return {
      rule: 'wikilinks.store-unavailable',
      severity: 'warning',
      message: `${link} targets the store "${store}", which could not be read here: ${foreignStore.reason}`,
    };
  }
  if (foreignStore.status === 'disallowed') {
    return {
      rule: 'wikilinks.disallowed-store',
      severity: 'error',
      message: `${link} targets "${store}", a ${foreignStore.visibility} store, which a ${options.sourceVisibility} store may not link into: the link discloses the target's title`,
    };
  }

  const resolved = foreignStore.index.get(lookupKey(target));
  if (resolved !== undefined && resolved.size > 0) return undefined;
  return {
    rule: 'wikilinks.unresolved',
    severity: 'error',
    message: `${link} does not resolve to any note in the store "${store}"`,
  };
}

/** Describes why a store-local link failed to resolve, or `undefined` when it resolved. */
function describeLocalDefect(
  target: string,
  vaultIndex: VaultIndex,
): Pick<Finding, 'rule' | 'severity' | 'message'> | undefined {
  const resolved = vaultIndex.get(lookupKey(target));
  if (resolved !== undefined && resolved.size > 0) return undefined;
  return {
    rule: 'wikilinks.unresolved',
    severity: 'error',
    message: `[[${target}]] does not resolve to any vault note`,
  };
}

// endregion | Helpers
