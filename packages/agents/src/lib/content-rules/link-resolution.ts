import { existsSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { collectHeadingSlugs, findUnterminatedFence, normalizeForAnchorScan } from '../anchor-resolution.ts';
import type { ContentDefect } from '../content-defects.ts';
import { expandIncludes } from '../directive-expander.ts';
import { listMarkdownFilesRecursively } from '../fs-helpers.ts';
import { isRewritableLinkTarget, MARKDOWN_LINK_REGEX } from '../path-rewriter.ts';
import { type RuleContext, toRootRelative } from './rule-context.ts';

/**
 * The trees whose files deploy as hosts whose links the installer resolves against the source tree. The rest of
 * `guidance/` is out of scope: `_harnesses/` resolves against the harness home rather than the source directory, and
 * `shared/` installs verbatim, which `shared-guidance-links` covers.
 */
const HOST_DIRECTORIES: ReadonlyArray<string> = ['guidance/rulebooks', 'skills', 'subagents'];

/** A file that a link resolved to, and the root that supplied it, against which its includes expand. */
interface LinkTarget {
  readonly file: string;
  readonly root: string;
}

/**
 * Reports each relative Markdown link, in an installable host's include-expanded body, whose file exists in neither
 * the root nor the library, or whose `#fragment` names zero or several headings in the file into which it points.
 *
 * A relative target resolves against the host's own directory, as `rewriteMarkdownPaths` resolves it, and then at the
 * same root-relative path in the library: The deployed tree unions the two, so a root may link to a library file.
 * A `_partials/` file is never a host. Its links are authored against the host that inlines it, and expansion reaches
 * them there.
 *
 * Anchor-only targets and an unterminated fence are left to the render pass, which rejects both in every host that it
 * renders. A host with an open fence is skipped, since its links below the fence are not the ones that it contains.
 */
export async function findLinkResolutionDefects({
  root,
  libraryDir,
}: RuleContext): Promise<ReadonlyArray<ContentDefect>> {
  const headingsByFile = new Map<string, ReadonlyMap<string, number>>();
  const defects: Array<ContentDefect> = [];

  const hosts = await listHosts(root);
  for (const host of hosts) {
    const relativePath = toRootRelative(root, host);
    let expanded: string;
    try {
      expanded = await expandIncludes(host, root);
    } catch (error: unknown) {
      defects.push({ file: relativePath, kind: 'link', detail: describeError(error) });
      continue;
    }
    if (findUnterminatedFence(expanded) !== undefined) {
      continue;
    }

    const seen = new Set<string>();
    for (const match of normalizeForAnchorScan(expanded).matchAll(MARKDOWN_LINK_REGEX)) {
      const target = match[2];
      if (target === undefined || !isRewritableLinkTarget(target) || seen.has(target)) {
        continue;
      }
      seen.add(target);

      const problem = await findLinkProblem(target, host, { root, libraryDir }, headingsByFile);
      if (problem !== undefined) {
        defects.push({
          file: relativePath,
          kind: 'link',
          detail: `Links to \`${target}\`, ${problem}. If the link was authored in an inlined partial, fix it there.`,
        });
      }
    }
  }
  return defects;
}

// region | Helpers

/** Describes why `target` fails to resolve from `host`, or returns `undefined` when it resolves. */
async function findLinkProblem(
  target: string,
  host: string,
  roots: { readonly root: string; readonly libraryDir: string },
  headingsByFile: Map<string, ReadonlyMap<string, number>>,
): Promise<string | undefined> {
  const hashIndex = target.indexOf('#');
  const filePart = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : target.slice(hashIndex + 1);

  const resolved = resolveLinkTarget(path.resolve(path.dirname(host), filePart), roots);
  if (resolved === undefined) {
    return 'whose file is present in neither the content root nor the library';
  }
  // Only Markdown has headings; a fragment on any other target has nothing to resolve against.
  if (fragment === '' || !resolved.file.endsWith('.md')) {
    return undefined;
  }

  let headings = headingsByFile.get(resolved.file);
  if (headings === undefined) {
    try {
      headings = collectHeadingSlugs(normalizeForAnchorScan(await expandIncludes(resolved.file, resolved.root)));
    } catch (error: unknown) {
      return `whose file cannot be expanded: ${describeError(error)}`;
    }
    headingsByFile.set(resolved.file, headings);
  }

  const matches = headings.get(fragment) ?? 0;
  if (matches === 0) {
    return 'whose fragment does not name any heading in that file';
  }
  return matches > 1 ? `whose fragment names ${matches} headings in that file` : undefined;
}

/** Lists the Markdown hosts under the root's host directories, skipping `_partials/` and dotfiles at any depth. */
async function listHosts(root: string): Promise<ReadonlyArray<string>> {
  const hosts: Array<string> = [];
  for (const directory of HOST_DIRECTORIES) {
    const files = await listMarkdownFilesRecursively(path.join(root, directory));
    hosts.push(
      ...files.filter((file) =>
        toRootRelative(root, file)
          .split('/')
          .every((segment) => segment !== '_partials' && !segment.startsWith('.')),
      ),
    );
  }
  return hosts;
}

/**
 * Locates the file that a resolved link path names: under the root as written, or else at the same root-relative path
 * in the library. A path that leaves the root is looked for as written alone.
 */
function resolveLinkTarget(
  targetPath: string,
  { root, libraryDir }: { readonly root: string; readonly libraryDir: string },
): LinkTarget | undefined {
  if (existsSync(targetPath)) {
    return { file: targetPath, root };
  }
  const relativePath = path.relative(root, targetPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return undefined;
  }
  const libraryPath = path.join(libraryDir, relativePath);
  return existsSync(libraryPath) ? { file: libraryPath, root: libraryDir } : undefined;
}

// endregion | Helpers
