import { assertAnchorsResolve } from './anchor-resolution.ts';
import { mergeFrontmatter } from './frontmatter-merger.ts';
import { rewriteInvocationTokens } from './invocation-tokens.ts';
import { type ResolveLinkAnchor, rewriteMarkdownPaths, rewriteTemplateVariables } from './path-rewriter.ts';
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
}

/**
 * Renders a subagent's harness-specific deployed body from its include-expanded source: merges the harness overlay
 * frontmatter, rewrites `{tool:NAME}` placeholders, rewrites relative Markdown links, then expands template variables.
 * Pure string in, marker-free string out — both `install` and `sync` compose ownership/provenance marking around it.
 * In-body anchors are validated on the source text, ahead of every rewrite, so the verdict holds for every harness.
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
  }: SubagentRenderContext,
): string {
  assertAnchorsResolve(expandedSource, sourceLabel);
  const merged = mergeFrontmatter(expandedSource, overlayYaml);
  const rewrittenTools = rewriteToolNames(merged, toolMapping, sourceLabel);
  const rewrittenInvocations = rewriteInvocationTokens(rewrittenTools, { skillSigil, subagentSigil }, sourceLabel);
  const rewrittenPaths = rewriteMarkdownPaths(rewrittenInvocations, fileRelPath, anchor);
  return rewriteTemplateVariables(rewrittenPaths, homeDir, harnessId);
}
