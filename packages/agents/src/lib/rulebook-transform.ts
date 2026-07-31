import path from 'node:path';

import { assertAnchorsResolve } from './anchor-resolution.ts';
import {
  extractInvocationEdges,
  resolveRulebookToken,
  rewriteInvocationTokens,
  type RulebookInvocationCatalog,
} from './invocation-tokens.ts';
import { listRewritableLinkTargets, rewriteMarkdownPaths, rewriteTemplateVariables } from './path-rewriter.ts';

/** The per-harness inputs a rulebook body render depends on, resolved once per harness by the caller. */
export interface RulebookRenderContext {
  /**
   * Harness home segment: both the prefix `~/`-prefixed link targets are built under and the `{harness_home_dir}`
   * expansion target (e.g. `.claude`).
   */
  readonly homeDir: string;
  /** Harness identifier that `{harness_id}` tokens expand to (e.g. `claude`). */
  readonly harnessId: string;
  /** Sigil prefixed to a rendered `{skill:<slug>}` or `{rulebook:<slug>}` token (e.g. `/` for Claude). */
  readonly skillSigil: string;
  /** Sigil prefixed to a rendered `{subagent:<slug>}` token (empty on both current harnesses). */
  readonly subagentSigil: string;
  /** The deployed rulebooks a `{rulebook:<slug>}` token may address, keyed by slug. */
  readonly rulebooks: RulebookInvocationCatalog;
}

/**
 * Content-root-relative directory a rulebook source lives in. Anchoring the rewrite here is what lets a rulebook
 * address a sibling tree the way its own source tree is laid out.
 */
const RULEBOOK_SOURCE_DIR = 'guidance/rulebooks';

/**
 * Content-root children a rulebook link target may address, because each deploys to a same-named directory under
 * every harness home. `subagents/` is excluded: a subagent definition is dispatched rather than read, so there is no
 * link worth authoring into one. `_partials/`, `collections/`, and `guidance/` never deploy as files at all.
 */
const LINKABLE_ROOTS: ReadonlyArray<string> = ['scripts', 'skills'];

/**
 * Renders one rulebook's neutral body for a single harness: relative Markdown links become that harness's absolute
 * paths, invocation tokens become that harness's sigil plus the slug they invoke, and template variables expand.
 * In-body anchors, link targets, and rulebook tokens are validated first, so a reference the delivery pipeline cannot
 * honor fails the run instead of shipping as a dead address.
 *
 * `slug` anchors link rewriting: a relative target resolves against `guidance/rulebooks/<slug>.md`, matching where the
 * rulebook sits in its content root, and the emitted path is rooted at the harness home. A `{rulebook:<slug>}` token
 * renders the deployed skill name of the rulebook it names, which is why the context carries the deployed set.
 */
export function renderRulebookBody(body: string, slug: string, context: RulebookRenderContext): string {
  // Labelled by source path where the two asserts below name the slug: this rejection is raised identically for
  // skills and subagents, so it identifies a rulebook the way it identifies them.
  assertAnchorsResolve(body, `${RULEBOOK_SOURCE_DIR}/${slug}.md`);
  assertLinkTargetsAreDeliverable(body, slug);
  assertRulebookTokensResolve(body, slug, context.rulebooks);
  const pathRewritten = rewriteMarkdownPaths(body, `${RULEBOOK_SOURCE_DIR}/${slug}.md`, context.homeDir);
  const tokenRewritten = rewriteInvocationTokens(
    pathRewritten,
    context,
    `${RULEBOOK_SOURCE_DIR}/${slug}.md`,
    context.rulebooks,
  );
  return rewriteTemplateVariables(tokenRewritten, context.homeDir, context.harnessId);
}

// region | Helpers

/**
 * Throws when any rewritable link target in `body` names a location the delivery pipeline never creates: one escaping
 * the content root, or one rooted outside `LINKABLE_ROOTS`. Every offending target is reported together, so an author
 * fixing a rulebook sees the whole list rather than one target per run.
 *
 * Existence is deliberately not checked here. A target resolves against the deployed tree, which unions library
 * content with each declared source's content, so testing it against the one content root this rulebook came from
 * would reject a project or machine-local rulebook's link to library content.
 */
function assertLinkTargetsAreDeliverable(body: string, slug: string): void {
  const rejections: Array<string> = [];
  for (const target of listRewritableLinkTargets(body)) {
    const reason = describeRejection(target);
    if (reason !== undefined) {
      rejections.push(`  ${target} -- ${reason}`);
    }
  }

  if (rejections.length > 0) {
    throw new Error(
      `Rulebook "${slug}" carries ${rejections.length} unusable Markdown link target(s). A rulebook may link only ` +
        `into ${LINKABLE_ROOTS.join('/ and ')}/, the trees that deploy under every harness home:\n` +
        rejections.join('\n'),
    );
  }
}

/**
 * Throws when any `{rulebook:<slug>}` token in `body` names a rulebook that deploys no skill to invoke. Every
 * offending token is reported together, matching how link targets are reported, so an author fixing a rulebook sees
 * the whole list rather than one token per run.
 */
function assertRulebookTokensResolve(body: string, slug: string, rulebooks: RulebookInvocationCatalog): void {
  const rejections: Array<string> = [];
  for (const target of extractInvocationEdges(body).rulebooks) {
    const resolution = resolveRulebookToken(target, rulebooks);
    if (resolution.kind === 'rejected') {
      rejections.push(`  {rulebook:${target}} -- it ${resolution.reason}`);
    }
  }

  if (rejections.length > 0) {
    throw new Error(
      `Rulebook "${slug}" carries ${rejections.length} unusable invocation token(s):\n${rejections.join('\n')}`,
    );
  }
}

/** Names why a link target cannot be delivered, or `undefined` when it resolves into a linkable root. */
function describeRejection(target: string): string | undefined {
  const hashIndex = target.indexOf('#');
  const pathPart = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const resolved = path.posix.normalize(path.posix.join(RULEBOOK_SOURCE_DIR, pathPart));

  if (resolved === '..' || resolved.startsWith('../')) {
    return 'escapes the content root';
  }
  if (resolved.startsWith(`${RULEBOOK_SOURCE_DIR}/`)) {
    const targetSlug = path.posix.basename(resolved, '.md');
    return `names rulebook "${targetSlug}", which is invoked rather than linked: write {rulebook:${targetSlug}} instead`;
  }
  const root = resolved.split('/', 1)[0];
  if (root === undefined || !LINKABLE_ROOTS.includes(root)) {
    return `resolves to "${resolved}", which is not under a linkable root`;
  }
  return undefined;
}

// endregion | Helpers
