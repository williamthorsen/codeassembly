/**
 * Byte measurement for the streamline-guidance helper: what each guidance file deploys once its includes are
 * expanded, and the regions that a deployment rewrites.
 */
import { statSync } from 'node:fs';
import path from 'node:path';

import { buildIncludeGraph, DirectiveExpansionError, expandIncludes, type IncludeGraph } from 'codeassembly/api';

import { findContentRoot, listContentRoots } from './content-roots.ts';
import type { StreamlineGit } from './git.ts';
import type { LineRange } from './types.ts';

/**
 * Returns the line ranges of every region that a deployment rewrites, running to the end for a region without an end
 * marker.
 */
export function findGeneratedRegions(content: string): LineRange[] {
  const lines = content.split('\n');
  const regions: LineRange[] = [];
  let index = 0;
  while (index < lines.length) {
    const name = GENERATED_REGION_START_REGEX.exec(lines[index] ?? '')?.[1];
    if (name === undefined) {
      index += 1;
      continue;
    }
    const endMarker = `<!-- codeassembly-${name}:end -->`;
    const endIndex = lines.findIndex((line, lineIndex) => lineIndex > index && line.trim() === endMarker);
    const end = endIndex === -1 ? lines.length : endIndex + 1;
    regions.push({ start: index + 1, end });
    index = end;
  }
  return regions;
}

/** Returns the include graph of a content root, building it on the run's first file inside that root. */
export async function loadIncludeGraph(contentRoot: string, context: MeasurementContext): Promise<IncludeGraph> {
  const cached = context.graphs.get(contentRoot);
  if (cached !== undefined) {
    return cached;
  }
  const graph = await buildIncludeGraph(contentRoot);
  context.graphs.set(contentRoot, graph);
  return graph;
}

/** The values that measuring deployed bytes fixes for one run. */
export interface MeasurementContext {
  contentRoots: readonly string[];
  git: StreamlineGit;
  /** The include graph of each content root that the run has reached, built once per root. */
  graphs: Map<string, IncludeGraph>;
  root: string;
}

/** Measures what each repository-relative file deploys, on the terms that `resolve` reports as `deployedBytes`. */
export async function measureDeployedBytes(
  root: string,
  files: readonly string[],
  git: StreamlineGit,
): Promise<Map<string, number>> {
  return measureFiles(files, { contentRoots: listContentRoots(root, git), git, graphs: new Map(), root });
}

/**
 * Measures what each file deploys: for a document, its size once its includes are expanded; for a file that deploys
 * only inside the documents that include it, its own size times the number of documents that it reaches. A file
 * outside every content root, and one whose includes cannot be expanded, is absent from the result.
 *
 * The transforms that a deployment applies per harness are excluded: the provenance header, the ownership marker,
 * path rewriting, and guidance-hook injection. A hook's bound rulebooks are declared in the machine's agent
 * configuration rather than in the content root, so their bytes are not computable from the repository, and the
 * deployment injects their text into a generated region that a run may not cut. The rest add a constant of a few
 * hundred bytes.
 */
export async function measureFiles(
  files: readonly string[],
  context: MeasurementContext,
): Promise<Map<string, number>> {
  const measured = new Map<string, number>();
  for (const file of files) {
    const absolutePath = path.join(context.root, file);
    const contentRoot = findContentRoot(absolutePath, context.contentRoots);
    if (contentRoot === undefined) {
      continue;
    }
    const graph = await loadIncludeGraph(contentRoot, context);
    if (graph.hasUnresolvedIncludes(absolutePath)) {
      continue;
    }
    const deployed = graph.documents.has(absolutePath)
      ? await measureExpandedBytes(absolutePath, contentRoot)
      : statSync(absolutePath).size * graph.countReach(absolutePath);
    if (deployed !== undefined) {
      measured.set(file, deployed);
    }
  }
  return measured;
}

// region | Helpers

/** Matches the start marker of a region that a deployment rewrites, whose captured group names the region. */
const GENERATED_REGION_START_REGEX =
  /^[ \t]*<!-- codeassembly-(ambient|guidance-hook:[a-z][a-z0-9-]*):start -->[ \t]*$/;

/**
 * Measures a document's body once its includes are expanded, and reports undefined when they cannot be expanded.
 *
 * Expansion rejects directive shapes that the include graph accepts: an unclosed open directive, an orphan close, a
 * slot without a `<!-- children -->` placeholder to fill, and a cycle, which the graph's walk terminates rather than
 * refuses. A file containing one deploys nothing that this helper can size, which an absent figure already reports.
 */
async function measureExpandedBytes(file: string, contentRoot: string): Promise<number | undefined> {
  try {
    return new TextEncoder().encode(await expandIncludes(contentRoot, file)).length;
  } catch (error) {
    if (!(error instanceof DirectiveExpansionError)) throw error;
    return undefined;
  }
}

// endregion | Helpers
