import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { expandIncludes } from './directive-expander.ts';
import { isTestDirectory } from './fs-helpers.ts';
import { assertFilledAnchorsResolve, fillGuidanceHooks, type GuidanceHookFills } from './guidance-hooks.ts';
import { rewriteInvocationTokens, type RulebookInvocationCatalog } from './invocation-tokens.ts';
import {
  type ResolveLinkAnchor,
  rewriteMarkdownPaths,
  rewriteTemplateVariables,
  type TemplateVariables,
} from './path-rewriter.ts';
import { rewriteToolNames } from './tool-name-rewriter.ts';

/** The per-harness inputs on which a declared-skill render depends, resolved once per harness by the caller. */
export interface SkillDeployContext extends TemplateVariables {
  /** Maps a resolved Markdown link target, relative to the harness skills dir, to the path at which it deploys. */
  readonly anchor: ResolveLinkAnchor;
  /** Sigil prefixed to a rendered `{skill:<slug>}` invocation token (e.g. `/` for Claude). */
  readonly skillSigil: string;
  /** Sigil prefixed to a rendered `{subagent:<slug>}` invocation token (empty on both current harnesses). */
  readonly subagentSigil: string;
  /**
   * Guidance bound to each hook that a declared skill's body may declare. Absent for every caller that resolves no
   * declaration (`install`, `validate`, and the support-entry route), which keeps them stripping.
   */
  readonly guidanceHookFills?: GuidanceHookFills | undefined;
  /**
   * The deployed rulebooks that a `{rulebook:<slug>}` token may address. Absent for the support-entry route, which
   * `install` ships having resolved no declaration, so a token there is rejected rather than rendered.
   */
  readonly rulebooks?: RulebookInvocationCatalog | undefined;
}

/**
 * One file of a rendered skill directory, keyed by its POSIX path relative to the skill's destination root. A `markdown`
 * entry contains its fully transformed text; an `asset` entry names its source path for the caller to copy verbatim.
 */
export type RenderedSkillEntry =
  | { readonly kind: 'markdown'; readonly relPath: string; readonly content: string }
  | { readonly kind: 'asset'; readonly relPath: string; readonly srcPath: string };

/**
 * One `skills/` support entry's rendered form, discriminated by how it materializes: A directory yields the rendered
 * tree, a Markdown file its transformed text, and anything else nothing at all, because it installs byte-for-byte.
 */
export type RenderedSupportEntry =
  | { readonly kind: 'directory'; readonly entries: ReadonlyArray<RenderedSkillEntry> }
  | { readonly kind: 'markdown'; readonly content: string }
  | { readonly kind: 'verbatim' };

/**
 * Whether a directory entry's name is one that the skill walk passes over at every depth: a `_partials/` directory, a
 * test directory, or a dotfile.
 */
export function isSkippedSkillEntry(name: string): boolean {
  return name === '_partials' || isTestDirectory(name) || name.startsWith('.');
}

/**
 * Renders a declared skill's directory for one harness: Every `.md` file is include-expanded, then tool-name-rewritten,
 * then link/template-rewritten; non-`.md` files are returned as assets to copy verbatim.
 * Read-only; the caller composes its own write strategy and markers around the transform.
 * Throws (with a file:line anchor) on a broken include or an unmapped `{tool:NAME}` placeholder.
 *
 * `slug` anchors link rewriting: A relative Markdown link resolves against `<slug>/<file>`, matching how the deployed
 * skill is laid out under the harness skills dir, and the context's anchor maps that result to its deployed path.
 * `_partials/` directories, test directories, and dotfiles are skipped at every depth: Partials are include targets
 * and tests are the skill's own coverage, neither of them deployed artifacts.
 *
 * `contentRoot` is the include-containment root: Every `<!-- include: … -->` target must resolve within it, and it
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
 * Renders one `skills/` support entry the way an install materializes it: every Markdown file through the whole skill
 * transform, whether it is in a support directory or directly under `skills/`, and anything else not at all, since
 * it is copied byte-for-byte and has nothing to check. Shape decides how an entry is walked, never which rewrites
 * apply to the Markdown that it contains.
 *
 * A support entry never fills a hook, whichever route it takes, so any fills that the caller supplies are dropped
 * here. A support entry is reached by a link rather than inlined, and guidance behind a link is what the hook
 * mechanism exists to route around. Its rulebook catalog is dropped for a different reason: `install` ships a support
 * entry having resolved no declaration. Honoring a `{rulebook:<slug>}` token under `sync` or `validate` alone would
 * pass a gate that the ship then fails. Dropping both here rather than at each call site keeps the three routes
 * agreeing on what a support entry is.
 *
 * `destName` is the entry's deployed name, which anchors link rewriting: the directory that contains a directory
 * entry's files, and the file's own name for a Markdown file entry.
 */
export async function renderSupportEntry(
  srcPath: string,
  destName: string,
  contentRoot: string,
  context: SkillDeployContext,
): Promise<RenderedSupportEntry> {
  const unbound: SkillDeployContext = { ...context, guidanceHookFills: undefined, rulebooks: undefined };
  if ((await stat(srcPath)).isDirectory()) {
    return { kind: 'directory', entries: await renderSkillDirectory(srcPath, destName, contentRoot, unbound) };
  }
  if (!srcPath.endsWith('.md')) {
    return { kind: 'verbatim' };
  }
  return { kind: 'markdown', content: await renderMarkdown(srcPath, destName, contentRoot, unbound) };
}

// region | Helpers

/**
 * Recursively walks `dir`, skipping `_partials/`, test directories, and dotfiles, accumulating rendered entries keyed
 * by relative path. It collects exactly what is deployed to a harness home; a skill's own tests are not part of what
 * it ships.
 */
async function collectEntries(
  dir: string,
  relDir: string,
  slug: string,
  contentRoot: string,
  context: SkillDeployContext,
  out: Array<RenderedSkillEntry>,
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (isSkippedSkillEntry(entry.name)) {
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
        content: await renderMarkdown(srcPath, `${slug}/${relPath}`, contentRoot, context),
      });
    } else {
      out.push({ kind: 'asset', relPath, srcPath });
    }
  }
}

/**
 * Applies the skill `.md` transform chain: include expansion, guidance-hook fill, tool-name rewrite, invocation-token
 * rewrite, link rewrite, template expansion. Invocation tokens are rewritten after tool names (their relative order is
 * immaterial, because the two grammars are disjoint) and before link rewriting (a rendered `/slug` is not a Markdown
 * link, so path rewriting leaves it untouched).
 *
 * Hooks resolve after includes expand, which makes a hook declared in a partial a declaration by every body
 * that inlines it. A bound body arrives already rendered, and the rewrites below leave it alone: Its link targets are
 * absolute by then, and its tokens are spent.
 *
 * In-body anchors are validated on the filled text, ahead of every rewrite: An anchor-only target is never rewritten.
 * The verdict holds for every harness, and a heading containing a `{tool:NAME}` token is correctly unaddressable.
 * Validating after the fill lets a collision between host and bound guidance be caught at all.
 *
 * `fileRelPath` is the file's own path relative to the deployed skills directory, against which a relative Markdown
 * link resolves before the context's anchor maps the result to its deployed path.
 */
async function renderMarkdown(
  srcPath: string,
  fileRelPath: string,
  contentRoot: string,
  context: SkillDeployContext,
): Promise<string> {
  const { anchor, harnessId, skillSigil, subagentSigil } = context;
  const contextLabel = path.relative(contentRoot, srcPath).split(path.sep).join('/');
  const filled = fillGuidanceHooks(await expandIncludes(srcPath, contentRoot), context.guidanceHookFills, contextLabel);
  assertFilledAnchorsResolve(filled, contextLabel);
  const toolRewritten = rewriteToolNames(filled.content, harnessId, contextLabel);
  const invocationRewritten = rewriteInvocationTokens(
    toolRewritten,
    { skillSigil, subagentSigil },
    contextLabel,
    context.rulebooks,
  );
  const pathRewritten = rewriteMarkdownPaths(invocationRewritten, fileRelPath, anchor);
  return rewriteTemplateVariables(pathRewritten, context);
}

// endregion | Helpers
