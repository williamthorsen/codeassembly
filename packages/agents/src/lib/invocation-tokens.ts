/**
 * Matches `{skill:<slug>}` and `{subagent:<slug>}` invocation tokens. The slug is kebab-case and letter-led
 * (`[a-z][a-z0-9-]*`). The pattern only captures well-formed tokens; a slug naming no library artifact is caught
 * downstream by the resolver's existing missing-artifact check, so the grammar deliberately does not police existence.
 *
 * One shared constant serves both the render surface (`rewriteInvocationTokens`) and the edge surface
 * (`extractInvocationEdges`) so the two can never diverge on what a token is. Sharing it is safe: `String.replace`
 * resets `lastIndex` and `String.matchAll` clones the regex, so neither call leaks match state to the other.
 */
const INVOCATION_TOKEN_RE = /\{(skill|subagent):([a-z][a-z0-9-]*)\}/g;

/** The per-harness sigils prefixed to a rendered invocation token's slug. */
export interface InvocationSigils {
  /** Prefix for a rendered `{skill:<slug>}` token (e.g. `/` for Claude, `!` for Rovo). */
  readonly skillSigil: string;
  /** Prefix for a rendered `{subagent:<slug>}` token (empty on both current harnesses; a bare slug dispatches). */
  readonly subagentSigil: string;
}

/** Invocation slugs extracted from a body, grouped by token kind. Each list preserves source order and may repeat. */
export interface InvocationEdges {
  readonly skills: ReadonlyArray<string>;
  readonly subagents: ReadonlyArray<string>;
}

/**
 * Replaces every `{skill:<slug>}` / `{subagent:<slug>}` token in `content` with its harness sigil followed by the slug.
 * Unlike `rewriteToolNames`, this never throws: the sigil is a fixed property of the typed harness config, so there is
 * no unmapped-name failure path. Non-token text passes through unchanged.
 */
export function rewriteInvocationTokens(content: string, sigils: InvocationSigils): string {
  return content.replace(INVOCATION_TOKEN_RE, (_match: string, kind: string, slug: string): string => {
    const sigil = kind === 'skill' ? sigils.skillSigil : sigils.subagentSigil;
    return `${sigil}${slug}`;
  });
}

/**
 * Collects every invocation token in `content`, grouping slugs by kind. Non-token text is ignored. Slugs are returned
 * in source order without dedup; the dependency resolver's `visit` carries dedup and cycle-safety, so the caller need
 * not.
 */
export function extractInvocationEdges(content: string): InvocationEdges {
  const skills: Array<string> = [];
  const subagents: Array<string> = [];
  for (const [, kind, slug] of content.matchAll(INVOCATION_TOKEN_RE)) {
    // Both capture groups always participate when the overall match succeeds; the guard keeps the type honest
    // (under noUncheckedIndexedAccess the destructured elements are string | undefined) without a type assertion.
    if (slug === undefined) {
      continue;
    }
    if (kind === 'skill') {
      skills.push(slug);
    } else {
      subagents.push(slug);
    }
  }
  return { skills, subagents };
}
