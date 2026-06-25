import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { mergeFrontmatter } from './frontmatter-merger.ts';
import { rewriteMarkdownPaths, rewriteTemplateVariables } from './path-rewriter.ts';
import { rewriteToolNames } from './tool-name-rewriter.ts';
import { isEnoent } from './type-guards.ts';
import type { HarnessConfig } from './types.ts';

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
  /** Harness-relative prefix under which `~/`-prefixed Markdown link targets are constructed (e.g. `.claude`). */
  readonly pathPrefix: string;
  /** Harness home segment that `{harness_home_dir}` tokens expand to (e.g. `.claude`). */
  readonly homeDir: string;
  /** Harness identifier that `{harness_id}` tokens expand to (e.g. `claude`). */
  readonly harnessId: string;
}

/**
 * Renders a subagent's harness-specific deployed body from its include-expanded source: merges the harness overlay
 * frontmatter, rewrites `{tool:NAME}` placeholders, rewrites relative Markdown links, then expands template variables.
 * Pure string in, marker-free string out — both `install` and `sync` compose ownership/provenance marking around it.
 *
 * `pathPrefix` and `homeDir` are distinct named arguments even though every current caller passes the same value:
 * `pathPrefix` is the harness-relative directory used to build `~/`-prefixed link targets, while `homeDir` is the
 * expansion target for `{harness_home_dir}` tokens. Keeping them separate prevents a future caller with a different
 * prefix from silently getting wrong link rewrites.
 */
export function renderSubagentForHarness(
  expandedSource: string,
  { overlayYaml, toolMapping, fileRelPath, sourceLabel, pathPrefix, homeDir, harnessId }: SubagentRenderContext,
): string {
  const merged = mergeFrontmatter(expandedSource, overlayYaml);
  const rewrittenTools = rewriteToolNames(merged, toolMapping, sourceLabel);
  const rewrittenPaths = rewriteMarkdownPaths(rewrittenTools, fileRelPath, pathPrefix);
  return rewriteTemplateVariables(rewrittenPaths, homeDir, harnessId);
}

/**
 * Reads the subagent overlay YAML for a harness, returning an empty string when the file does not exist. Shared by
 * `install` and `sync` so both apply the same `_defaults`/per-agent merge and `{tool:NAME}` mapping.
 */
export async function loadSubagentOverlay(contentDir: string, harnessConfig: HarnessConfig): Promise<string> {
  const overlayPath = path.join(contentDir, 'subagents', '_data', harnessConfig.frontmatterFile);
  try {
    return await readFile(overlayPath, 'utf8');
  } catch (error: unknown) {
    if (!isEnoent(error)) {
      throw error;
    }
    return '';
  }
}
