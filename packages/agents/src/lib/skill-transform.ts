import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { assertAnchorsResolve } from './anchor-resolution.ts';
import { expandIncludes } from './directive-expander.ts';
import { isTestDirectory } from './fs-helpers.ts';
import { stripGuidanceHooks } from './guidance-hooks.ts';
import { rewriteInvocationTokens } from './invocation-tokens.ts';
import { type ResolveLinkAnchor, rewriteMarkdownPaths, rewriteTemplateVariables } from './path-rewriter.ts';
import { rewriteToolNames } from './tool-name-rewriter.ts';

/** The per-harness inputs a declared-skill render depends on, resolved once per harness by the caller. */
export interface SkillDeployContext {
  /** Canonical → harness tool-name mapping for the `{tool:NAME}` body-text rewriter. */
  readonly toolMapping: ReadonlyMap<string, string>;
  /** Maps a resolved Markdown link target, relative to the harness skills dir, to the path it deploys at. */
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
 * One file of a rendered skill directory, keyed by its POSIX path relative to the skill's destination root. A `markdown`
 * entry carries its fully transformed text; an `asset` entry carries its source path for the caller to copy verbatim.
 */
export type RenderedSkillEntry =
  | { readonly kind: 'markdown'; readonly relPath: string; readonly content: string }
  | { readonly kind: 'asset'; readonly relPath: string; readonly srcPath: string };

/**
 * One `skills/` support entry's rendered form, discriminated by how it materializes: a directory yields the rendered
 * tree, a Markdown file its transformed text, and anything else nothing at all, because it installs byte-for-byte.
 */
export type RenderedSupportEntry =
  | { readonly kind: 'directory'; readonly entries: ReadonlyArray<RenderedSkillEntry> }
  | { readonly kind: 'markdown'; readonly content: string }
  | { readonly kind: 'verbatim' };

/**
 * Renders a declared skill's directory for one harness: Every `.md` file is include-expanded, then tool-name-rewritten,
 * then link/template-rewritten; non-`.md` files are returned as assets to copy verbatim.
 * Read-only; the caller composes its own write strategy and markers around the transform.
 * Throws (with a file:line anchor) on a broken include or an unmapped `{tool:NAME}` placeholder.
 *
 * `slug` anchors link rewriting: a relative Markdown link resolves against `<slug>/<file>`, matching how the deployed
 * skill sits under the harness skills dir, and the context's anchor maps that result to its deployed path.
 * `_partials/` directories, test directories, and dotfiles are skipped at every depth — partials are include targets
 * and tests are the skill's own coverage, neither of them deployed artifacts.
 *
 * `contentRoot` is the include-containment root — every `<!-- include: … -->` target must resolve within it, and it
 * roots the source label in unmapped-tool errors. It is the skill's own content root: the library for a library skill,
 * the declaring source for a source skill.
 */
export async function renderSkillDirectory(
  srcDir: string,
  slug: string,
  contentRoot: string,
  context: SkillDeployContext,
): Promise<ReadonlyArray<RenderedSkillEntry>> {
  const entries: Array<RenderedSkillEntry> = [];
  await collectEntries(srcDir, '', slug, contentRoot, context, entries);
  return entries;
}

/**
 * Renders one `skills/` support entry the way an install materializes it: a directory through the whole skill
 * transform, a Markdown file through include expansion, the guidance-hook strip, the anchor gate, and the tool-name
 * rewrite, and anything else not at all, since it is copied byte-for-byte and has nothing to check.
 *
 * Shared by the installer, which writes what comes back, and by `validate`, which discards it. Rendering is where a
 * defect surfaces, so the pass that checks a support entry and the pass that ships it have to run the same one — when
 * they did not, `validate` rejected a shape the installer copies without complaint.
 *
 * `destName` is the entry's deployed directory name, which anchors link rewriting for a directory entry.
 */
export async function renderSupportEntry(
  srcPath: string,
  destName: string,
  contentRoot: string,
  context: SkillDeployContext,
): Promise<RenderedSupportEntry> {
  if ((await stat(srcPath)).isDirectory()) {
    return { kind: 'directory', entries: await renderSkillDirectory(srcPath, destName, contentRoot, context) };
  }
  if (!srcPath.endsWith('.md')) {
    return { kind: 'verbatim' };
  }
  const sourceLabel = path.relative(contentRoot, srcPath).split(path.sep).join('/');
  const expanded = stripGuidanceHooks(await expandIncludes(srcPath, contentRoot), sourceLabel);
  assertAnchorsResolve(expanded, sourceLabel);
  return { kind: 'markdown', content: rewriteToolNames(expanded, context.toolMapping, sourceLabel) };
}

// region | Helpers

/**
 * Recursively walks `dir`, skipping `_partials/`, test directories, and dotfiles, accumulating rendered entries keyed
 * by relative path. This is the walk every install and sync path runs, so what it collects is what reaches a harness
 * home; a skill's own tests are not part of what it ships.
 */
async function collectEntries(
  dir: string,
  relDir: string,
  slug: string,
  contentRoot: string,
  context: SkillDeployContext,
  out: Array<RenderedSkillEntry>,
): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '_partials' || isTestDirectory(entry.name) || entry.name.startsWith('.')) {
      continue;
    }
    const srcPath = path.join(dir, entry.name);
    const relPath = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectEntries(srcPath, relPath, slug, contentRoot, context, out);
    } else if (entry.name.endsWith('.md')) {
      out.push({
        kind: 'markdown',
        relPath,
        content: await renderMarkdown(srcPath, relPath, slug, contentRoot, context),
      });
    } else {
      out.push({ kind: 'asset', relPath, srcPath });
    }
  }
}

/**
 * Applies the skill `.md` transform chain: include expansion, guidance-hook strip, tool-name rewrite, invocation-token
 * rewrite, link rewrite, template expansion. Invocation tokens are rewritten after tool names (the two grammars are
 * disjoint, so their relative order is immaterial) and before link rewriting (a rendered `/slug` is not a Markdown
 * link, so path rewriting leaves it untouched).
 *
 * Hooks strip after includes expand, which is what makes a hook declared in a partial a declaration by every body that
 * inlines it.
 *
 * In-body anchors are validated on the expanded text, ahead of every rewrite: an anchor-only target is never rewritten,
 * so the verdict holds for every harness and a heading carrying a `{tool:NAME}` token is correctly unaddressable.
 */
async function renderMarkdown(
  srcPath: string,
  relPath: string,
  slug: string,
  contentRoot: string,
  context: SkillDeployContext,
): Promise<string> {
  const { anchor, toolMapping, homeDir, harnessId, skillSigil, subagentSigil } = context;
  const contextLabel = path.relative(contentRoot, srcPath).split(path.sep).join('/');
  const expanded = stripGuidanceHooks(await expandIncludes(srcPath, contentRoot), contextLabel);
  assertAnchorsResolve(expanded, contextLabel);
  const toolRewritten = rewriteToolNames(expanded, toolMapping, contextLabel);
  const invocationRewritten = rewriteInvocationTokens(toolRewritten, { skillSigil, subagentSigil }, contextLabel);
  const pathRewritten = rewriteMarkdownPaths(invocationRewritten, `${slug}/${relPath}`, anchor);
  return rewriteTemplateVariables(pathRewritten, homeDir, harnessId);
}

// endregion | Helpers
