import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { expandIncludes } from './directive-expander.ts';
import { rewriteMarkdownPaths, rewriteTemplateVariables } from './path-rewriter.ts';
import { rewriteToolNames } from './tool-name-rewriter.ts';

/** The per-harness inputs a declared-skill render depends on, resolved once per harness by the caller. */
export interface SkillDeployContext {
  /** Library content root, used to resolve include directives and to label unmapped-tool errors. */
  readonly contentDir: string;
  /** Canonical → harness tool-name mapping for the `{tool:NAME}` body-text rewriter. */
  readonly toolMapping: ReadonlyMap<string, string>;
  /** Harness-relative prefix under which `~/`-prefixed Markdown link targets are built (e.g. `.claude/skills`). */
  readonly pathPrefix: string;
  /** Harness home segment that `{harness_home_dir}` tokens expand to (e.g. `.claude`). */
  readonly homeDir: string;
  /** Harness identifier that `{harness_id}` tokens expand to (e.g. `claude`). */
  readonly harnessId: string;
}

/**
 * One file of a rendered skill directory, keyed by its POSIX path relative to the skill's destination root. A `markdown`
 * entry carries its fully transformed text; an `asset` entry carries its source path for the caller to copy verbatim.
 */
export type RenderedSkillEntry =
  | { readonly kind: 'markdown'; readonly relPath: string; readonly content: string }
  | { readonly kind: 'asset'; readonly relPath: string; readonly srcPath: string };

/**
 * Renders a declared skill's directory for one harness: Every `.md` file is include-expanded, then tool-name-rewritten,
 * then link/template-rewritten; non-`.md` files are returned as assets to copy verbatim.
 * Read-only; the caller composes its own write strategy and markers around the transform.
 * Throws (with a file:line anchor) on a broken include or an unmapped `{tool:NAME}` placeholder.
 *
 * `slug` anchors link rewriting: a relative Markdown link resolves against `<slug>/<file>` under `pathPrefix`, matching
 * how the deployed skill sits at `<pathPrefix>/<slug>/`. `_partials/` directories and dotfiles are skipped at every
 * depth — partials are include targets, never deployed artifacts.
 */
export async function renderSkillDirectory(
  srcDir: string,
  slug: string,
  context: SkillDeployContext,
): Promise<ReadonlyArray<RenderedSkillEntry>> {
  const entries: Array<RenderedSkillEntry> = [];
  await collectEntries(srcDir, '', slug, context, entries);
  return entries;
}

// region | Helpers

/** Recursively walks `dir`, skipping `_partials/` and dotfiles, accumulating rendered entries keyed by relative path. */
async function collectEntries(
  dir: string,
  relDir: string,
  slug: string,
  context: SkillDeployContext,
  out: Array<RenderedSkillEntry>,
): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '_partials' || entry.name.startsWith('.')) {
      continue;
    }
    const srcPath = path.join(dir, entry.name);
    const relPath = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectEntries(srcPath, relPath, slug, context, out);
    } else if (entry.name.endsWith('.md')) {
      out.push({ kind: 'markdown', relPath, content: await renderMarkdown(srcPath, relPath, slug, context) });
    } else {
      out.push({ kind: 'asset', relPath, srcPath });
    }
  }
}

/** Applies the skill `.md` transform chain: include expansion, tool-name rewrite, link rewrite, template expansion. */
async function renderMarkdown(
  srcPath: string,
  relPath: string,
  slug: string,
  context: SkillDeployContext,
): Promise<string> {
  const { contentDir, toolMapping, pathPrefix, homeDir, harnessId } = context;
  const contextLabel = path.relative(contentDir, srcPath).split(path.sep).join('/');
  const expanded = await expandIncludes(srcPath, contentDir);
  const toolRewritten = rewriteToolNames(expanded, toolMapping, contextLabel);
  const pathRewritten = rewriteMarkdownPaths(toolRewritten, `${slug}/${relPath}`, pathPrefix);
  return rewriteTemplateVariables(pathRewritten, homeDir, harnessId);
}

// endregion | Helpers
