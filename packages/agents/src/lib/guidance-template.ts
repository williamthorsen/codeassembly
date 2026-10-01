import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { assertAnchorsResolve } from './anchor-resolution.ts';
import type { ContentRootRef } from './content-root-manifest.ts';
import { expandIncludes } from './directive-expander.ts';
import { stripGuidanceHooks } from './guidance-hooks.ts';
import { HARNESSES } from './harness.ts';
import { buildSourceReference, injectProvenanceMarker } from './marker-injector.ts';
import { homeAnchor, rewriteMarkdownPaths, rewriteTemplateVariables } from './path-rewriter.ts';
import { isEnoent } from './type-guards.ts';
import type { HarnessId } from './types.ts';

/**
 * Lists the file names that a root's `guidance/_harnesses/<harnessId>/` template directory installs into the harness
 * home: its visible regular files. A directory that is absent, or that holds only dotfiles and subdirectories, lists
 * nothing.
 */
export async function listGuidanceTemplateFiles(rootDir: string, harnessId: HarnessId): Promise<ReadonlyArray<string>> {
  const templateDir = resolveGuidanceTemplateDir(rootDir, harnessId);
  let dirEntries: ReadonlyArray<string>;
  try {
    dirEntries = await readdir(templateDir);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }

  const fileNames: Array<string> = [];
  for (const entry of dirEntries) {
    if (entry.startsWith('.')) {
      continue;
    }
    if ((await stat(path.join(templateDir, entry))).isFile()) {
      fileNames.push(entry);
    }
  }
  return fileNames;
}

/**
 * Renders one Markdown file of a harness guidance template as `install` writes it to the harness home: includes
 * expanded against the owning root, guidance-hook declarations stripped, link targets and template variables
 * rewritten for the harness home, and the provenance marker stamped. The ambient region is left as the template
 * declares it. Throws on a broken include, a malformed hook, or an anchor that names nothing.
 */
export async function renderGuidanceTemplateFile(
  root: ContentRootRef,
  harnessId: HarnessId,
  fileName: string,
): Promise<string> {
  const config = HARNESSES[harnessId];
  const sourceLabel = `guidance/_harnesses/${harnessId}/${fileName}`;
  const srcPath = path.join(resolveGuidanceTemplateDir(root.dir, harnessId), fileName);

  const expanded = stripGuidanceHooks(await expandIncludes(srcPath, root.dir), sourceLabel);
  assertAnchorsResolve(expanded, sourceLabel);
  const rewritten = rewriteTemplateVariables(rewriteMarkdownPaths(expanded, fileName, homeAnchor(config.homeDir)), {
    guidanceFileName: config.guidanceFileName,
    harnessId: config.id,
    homeDir: config.homeDir,
  });
  return injectProvenanceMarker(rewritten, buildSourceReference(root, sourceLabel));
}

/** Resolves the directory under `rootDir` from which a harness's guidance template installs. */
export function resolveGuidanceTemplateDir(rootDir: string, harnessId: HarnessId): string {
  return path.join(rootDir, 'guidance', '_harnesses', harnessId);
}
