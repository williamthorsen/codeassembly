/**
 * Matches `{rulebook:<slug>}`, `{skill:<slug>}`, and `{subagent:<slug>}` invocation tokens. The slug is kebab-case and
 * letter-led (`[a-z][a-z0-9-]*`). The pattern only captures well-formed tokens; a slug naming no library artifact is
 * caught downstream by the resolver's existing missing-artifact check, so the grammar deliberately does not police
 * existence.
 *
 * One shared constant serves both the render surface (`rewriteInvocationTokens`) and the edge surface
 * (`extractInvocationEdges`) so the two can never diverge on what a token is. Sharing it is safe: `String.replace`
 * resets `lastIndex` and `String.matchAll` clones the regex, so neither call leaks match state to the other.
 */
const INVOCATION_TOKEN_RE = /\{(rulebook|skill|subagent):([a-z][a-z0-9-]*)\}/g;

/** The kinds the pattern above can capture, typed as plain strings so the guard below can test an uncertain one. */
const TOKEN_KINDS: ReadonlySet<string> = new Set(['rulebook', 'skill', 'subagent']);

/** How a rulebook is addressed by an invocation token: the skill name it deploys under, and whether it deploys as one. */
export interface RulebookInvocationTarget {
  readonly skillName: string;
  readonly skill: boolean;
}

/**
 * The rulebooks a body may address by token, keyed by slug. Supplied by every host that resolves a declaration and so
 * knows the deployed set -- a rulebook, skill, or subagent body under `sync` or `validate`. A support entry under
 * `skills/` renders without one, because `install` ships it having resolved no declaration, which is what makes a
 * `{rulebook:<slug>}` token there fail rather than pass through.
 */
export type RulebookInvocationCatalog = ReadonlyMap<string, RulebookInvocationTarget>;

/** What a `{rulebook:<slug>}` token renders to, or the reason it cannot render. */
export type RulebookTokenResolution =
  { readonly kind: 'rejected'; readonly reason: string } | { readonly kind: 'resolved'; readonly skillName: string };

/** The per-harness sigils prefixed to a rendered invocation token's slug. */
export interface InvocationSigils {
  /** Prefix for a rendered `{skill:<slug>}` token (e.g. `/` for Claude, `!` for Rovo). */
  readonly skillSigil: string;
  /** Prefix for a rendered `{subagent:<slug>}` token (empty on both current harnesses; a bare slug dispatches). */
  readonly subagentSigil: string;
}

/** One invocation token in a body: what it invokes, the slug it names, and the index where the token begins. */
export interface InvocationToken {
  readonly kind: 'rulebook' | 'skill' | 'subagent';
  readonly slug: string;
  readonly index: number;
}

/** Invocation slugs extracted from a body, grouped by token kind. Each list preserves source order and may repeat. */
export interface InvocationEdges {
  readonly rulebooks: ReadonlyArray<string>;
  readonly skills: ReadonlyArray<string>;
  readonly subagents: ReadonlyArray<string>;
}

/**
 * Collects every invocation token in `content`, grouping slugs by kind. Non-token text is ignored. Slugs are returned
 * in source order without dedup; the dependency resolver's `visit` carries dedup and cycle-safety, so the caller need
 * not.
 */
export function extractInvocationEdges(content: string): InvocationEdges {
  const rulebooks: Array<string> = [];
  const skills: Array<string> = [];
  const subagents: Array<string> = [];
  for (const { kind, slug } of locateInvocationTokens(content)) {
    if (kind === 'rulebook') {
      rulebooks.push(slug);
    } else if (kind === 'skill') {
      skills.push(slug);
    } else {
      subagents.push(slug);
    }
  }
  return { rulebooks, skills, subagents };
}

/**
 * Lists every invocation token in `content` in source order, each with the index where it begins. `extractInvocationEdges`
 * answers what a body invokes; this answers where, which is what a caller attributing a token to the passage holding it
 * needs. Slugs repeat, for the reason that function gives.
 */
export function locateInvocationTokens(content: string): ReadonlyArray<InvocationToken> {
  const tokens: Array<InvocationToken> = [];
  for (const match of content.matchAll(INVOCATION_TOKEN_RE)) {
    const [, kind, slug] = match;
    // Both capture groups always participate when the overall match succeeds. The guards keep the type honest (under
    // noUncheckedIndexedAccess the destructured elements are string | undefined) and narrow the kind to the union the
    // token declares, both without a type assertion.
    if (slug === undefined || !isTokenKind(kind)) {
      continue;
    }
    tokens.push({ kind, slug, index: match.index });
  }
  return tokens;
}

/**
 * Resolves a `{rulebook:<slug>}` token to the skill name it renders, or to the reason it cannot render. One resolution
 * serves both surfaces that need it — the rewriter, which throws on the first rejection, and the rulebook validator,
 * which collects every rejection into one error — so neither can report a rejection the other would not.
 */
export function resolveRulebookToken(
  slug: string,
  rulebooks: RulebookInvocationCatalog | undefined,
): RulebookTokenResolution {
  if (rulebooks === undefined) {
    return {
      kind: 'rejected',
      reason:
        'is honored only where a declaration supplies the deployed rulebook set; a support entry under skills/ ' +
        'renders without one',
    };
  }
  const target = rulebooks.get(slug);
  if (target === undefined) {
    return { kind: 'rejected', reason: 'names no rulebook in the deployed set' };
  }
  if (!target.skill) {
    return {
      kind: 'rejected',
      reason:
        'names an ambient-only rulebook, which deploys no skill to invoke; express the relationship with ' +
        '`dependencies:` instead',
    };
  }
  return { kind: 'resolved', skillName: target.skillName };
}

/**
 * Replaces every invocation token in `content` with its harness sigil followed by the slug it invokes. A
 * `{rulebook:<slug>}` token renders the skill sigil and the target's deployed skill name, resolved through
 * `rulebooks` — so a rulebook is addressed by the name it actually deploys under, not by its slug.
 *
 * Throws when a rulebook token cannot render: no catalog (the host resolved no declaration), an unknown slug, or an
 * ambient-only target. `sourceLabel` names the host in that error, so an author sees which file to fix. Skill and
 * subagent tokens have no such failure path — their sigils are fixed properties of the typed harness config.
 * Non-token text passes through unchanged.
 */
export function rewriteInvocationTokens(
  content: string,
  sigils: InvocationSigils,
  sourceLabel: string,
  rulebooks?: RulebookInvocationCatalog,
): string {
  return content.replace(INVOCATION_TOKEN_RE, (_match: string, kind: string, slug: string): string => {
    if (kind === 'rulebook') {
      const resolution = resolveRulebookToken(slug, rulebooks);
      if (resolution.kind === 'rejected') {
        throw new Error(`Unusable invocation token {rulebook:${slug}} in ${sourceLabel}: it ${resolution.reason}.`);
      }
      return `${sigils.skillSigil}${resolution.skillName}`;
    }
    const sigil = kind === 'skill' ? sigils.skillSigil : sigils.subagentSigil;
    return `${sigil}${slug}`;
  });
}

// region | Helpers

/** Narrows a captured token kind to the union `InvocationToken` declares. */
function isTokenKind(value: string | undefined): value is InvocationToken['kind'] {
  return value !== undefined && TOKEN_KINDS.has(value);
}

// endregion | Helpers
