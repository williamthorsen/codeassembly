import { mergeFrontmatter } from './frontmatter-merger.ts';
import { assertFilledAnchorsResolve, fillGuidanceHooks, type GuidanceHookFills } from './guidance-hooks.ts';
import { rewriteInvocationTokens, type RulebookInvocationCatalog } from './invocation-tokens.ts';
import { type ResolveLinkAnchor, rewriteMarkdownPaths, rewriteTemplateVariables } from './path-rewriter.ts';
import { injectDeclaredRulebooks } from './subagent-rulebook-injection.ts';
import { rewriteToolNames } from './tool-name-rewriter.ts';

/** The harness-specific inputs a subagent render depends on, resolved once per harness by the caller. */
export interface SubagentRenderContext {
  /** Raw harness overlay YAML, feeding the frontmatter `_defaults`/per-agent merge. */
  readonly overlayYaml: string;
  /** Canonical → harness tool-name mapping for the `{tool:NAME}` body-text rewriter. */
  readonly toolMapping: ReadonlyMap<string, string>;
  /** The subagent file's path relative to the subagents tree root, anchoring relative Markdown link rewrites. */
  readonly fileRelPath: string;
  /** Content-relative source path (e.g. `subagents/canary.md`) used only as the unmapped-tool error reference. */
  readonly sourceLabel: string;
  /** Maps a resolved Markdown link target, relative to the content root, to the path it deploys at. */
  readonly anchor: ResolveLinkAnchor;
  /** Harness home segment that `{harness_home_dir}` tokens expand to (e.g. `.claude`). */
  readonly homeDir: string;
  /** Harness identifier that `{harness_id}` tokens expand to (e.g. `claude`). */
  readonly harnessId: string;
  /** Sigil prefixed to a rendered `{skill:<slug>}` invocation token (e.g. `/` for Claude). */
  readonly skillSigil: string;
  /** Sigil prefixed to a rendered `{subagent:<slug>}` invocation token (empty on both current harnesses). */
  readonly subagentSigil: string;
  /**
   * The deployed rulebooks a `{rulebook:<slug>}` token may address. Required rather than optional: every pass that
   * renders a subagent resolves a declaration, since `install` deploys none.
   */
  readonly rulebooks: RulebookInvocationCatalog;
  /**
   * Guidance bound to each hook the subagent's body may declare. Absent for every caller that resolves no declaration
   * — `install` and `validate` — which is what keeps them stripping.
   */
  readonly guidanceHookFills?: GuidanceHookFills | undefined;
}

/**
 * Renders a subagent's harness-specific deployed body from its include-expanded source: resolves guidance-hook
 * declarations, compiles any `rulebooks:` injection into `skills:`, merges the harness overlay frontmatter, rewrites
 * `{tool:NAME}` placeholders, rewrites relative Markdown links, then expands template variables.
 *
 * The injection precedes the overlay merge, so the overlay stays the last word on deployed frontmatter and its
 * line-based replacement runs over the re-serialized text rather than being undone by it. Pure string in, marker-free string out — both `install` and `sync` compose
 * ownership/provenance marking around it. In-body anchors are validated on the resolved text, ahead of every rewrite,
 * so the verdict holds for every harness and a collision between host and bound guidance is caught.
 *
 * Hooks resolve here rather than beside the caller's include expansion, so every path that renders a subagent body
 * passes through them. The fill precedes the frontmatter merge, and a directive written inside the frontmatter block
 * fails rather than splicing prose into YAML.
 *
 * `anchor` and `homeDir` are distinct arguments because they answer different questions: the anchor places a link
 * target in whichever tree deploys it, while `homeDir` expands `{harness_home_dir}` tokens, which name the harness
 * home whatever the target is.
 */
export function renderSubagentForHarness(
  expandedSource: string,
  {
    overlayYaml,
    toolMapping,
    fileRelPath,
    sourceLabel,
    anchor,
    homeDir,
    harnessId,
    skillSigil,
    subagentSigil,
    rulebooks,
    guidanceHookFills,
  }: SubagentRenderContext,
): string {
  const filled = fillGuidanceHooks(expandedSource, guidanceHookFills, sourceLabel);
  assertFilledAnchorsResolve(filled, sourceLabel);
  const injected = injectDeclaredRulebooks(filled.content, rulebooks, sourceLabel);
  const merged = mergeFrontmatter(injected, overlayYaml);
  const rewrittenTools = rewriteToolNames(merged, toolMapping, sourceLabel);
  const rewrittenInvocations = rewriteInvocationTokens(
    rewrittenTools,
    { skillSigil, subagentSigil },
    sourceLabel,
    rulebooks,
  );
  const rewrittenPaths = rewriteMarkdownPaths(rewrittenInvocations, fileRelPath, anchor);
  return rewriteTemplateVariables(rewrittenPaths, homeDir, harnessId);
}
