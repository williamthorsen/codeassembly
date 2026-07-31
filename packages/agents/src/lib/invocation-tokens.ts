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

/** How a rulebook is addressed by an invocation token: the skill name it deploys under, and whether it deploys as one. */
export interface RulebookInvocationTarget {
  readonly skillName: string;
  readonly skill: boolean;
}

/**
 * The rulebooks a body may address by token, keyed by slug. Supplied by hosts that render rulebook bodies and absent
 * everywhere else, which is what makes a `{rulebook:<slug>}` token outside a rulebook fail rather than pass through.
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
  for (const [, kind, slug] of content.matchAll(INVOCATION_TOKEN_RE)) {
    // Both capture groups always participate when the overall match succeeds; the guard keeps the type honest
    // (under noUncheckedIndexedAccess the destructured elements are string | undefined) without a type assertion.
    if (slug === undefined) {
      continue;
    }
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
 * Resolves a `{rulebook:<slug>}` token to the skill name it renders, or to the reason it cannot render. One resolution
 * serves both surfaces that need it — the rewriter, which throws on the first rejection, and the rulebook validator,
 * which collects every rejection into one error — so neither can report a rejection the other would not.
 */
export function resolveRulebookToken(
  slug: string,
  rulebooks: RulebookInvocationCatalog | undefined,
): RulebookTokenResolution {
  if (rulebooks === undefined) {
    return { kind: 'rejected', reason: 'is honored only in a rulebook body' };
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
 * Throws when a rulebook token cannot render: no catalog (the host does not honor them), an unknown slug, or an
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
