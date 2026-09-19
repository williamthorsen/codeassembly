import path from 'node:path';

import type { AuthoredSource, DeployedPath } from '../commands/sync/collect-deployed-paths.ts';
import { readFileSize } from '../lib/fs-helpers.ts';
import { buildIncludeGraph, type IncludeGraph } from '../lib/include-graph.ts';
import type { ExpansionUnit } from './types.ts';

/** The expansion rows that a snapshot records, and the per-document closures from which a report attributes them. */
export interface ExpansionMeasurement {
  /** Every unit that a deployed document inlines, keyed by `{kind}:{source}/{relPath}`. */
  readonly expansions: Record<string, ExpansionUnit>;
  /** The expansion keys inlined by each deployed document, keyed by deployed path. Recorded by no snapshot. */
  readonly documentExpansions: Record<string, ReadonlyArray<string>>;
}

/**
 * Measures the partials that the deployed documents inline: each one's own bytes on disk, the deployed documents that
 * it reaches, and which keys each document holds.
 *
 * One include graph is built per distinct content root and reused across that root's documents, because
 * `buildIncludeGraph` walks every `.md` under the root and building per document would re-walk the library once per
 * skill. A root whose graph cannot be built contributes no expansion and raises nothing, so a source that a later
 * command made unreadable leaves the deployment measured and its partials unattributed.
 *
 * Reach counts deployed documents rather than source documents, so that one skill deployed to two harnesses counts
 * twice and the number matches the document lines that the report's collapse removes.
 */
export async function measureExpansions(files: ReadonlyArray<DeployedPath>): Promise<ExpansionMeasurement> {
  const authored = files.flatMap((file) =>
    file.authored === undefined ? [] : [{ key: file.key, authored: file.authored }],
  );

  const contentRoots = new Set(authored.map((document) => path.resolve(document.authored.contentRoot)));
  const graphs = new Map<string, IncludeGraph | undefined>();
  for (const contentRoot of contentRoots) {
    graphs.set(contentRoot, await buildGraphOrDrop(contentRoot));
  }

  const documentExpansions: Record<string, ReadonlyArray<string>> = {};
  const pathsByKey = new Map<string, string>();
  const reach = new Map<string, number>();
  for (const { key, authored: source } of authored) {
    const graph = graphs.get(path.resolve(source.contentRoot));
    if (graph === undefined) {
      continue;
    }
    const keys = listExpansionKeys(graph, source, pathsByKey);
    documentExpansions[key] = keys;
    for (const expansionKey of keys) {
      reach.set(expansionKey, (reach.get(expansionKey) ?? 0) + 1);
    }
  }

  const expansions: Record<string, ExpansionUnit> = {};
  for (const [key, file] of pathsByKey) {
    const bytes = await readFileSize(file);
    if (bytes !== undefined) {
      expansions[key] = { bytes, reach: reach.get(key) ?? 0 };
    }
  }
  return { expansions, documentExpansions };
}

// region | Helpers

/** Builds one content root's include graph, or `undefined` when the root cannot be read. */
async function buildGraphOrDrop(contentRoot: string): Promise<IncludeGraph | undefined> {
  try {
    return await buildIncludeGraph(contentRoot);
  } catch {
    return undefined;
  }
}

/**
 * The keys of the units that one deployed document inlines, recording each key's file in `pathsByKey` so that the
 * bytes behind a key are read once however many documents reach it. A closure member that deploys as a document of
 * its own contributes no key, and neither does the document's own authored file.
 */
function listExpansionKeys(
  graph: IncludeGraph,
  source: AuthoredSource,
  pathsByKey: Map<string, string>,
): ReadonlyArray<string> {
  const contentRoot = path.resolve(source.contentRoot);
  const file = path.resolve(source.file);
  const keys: Array<string> = [];
  for (const member of graph.listClosure(file).files) {
    if (member === file || graph.documents.has(member)) {
      continue;
    }
    const key = `partial:${source.sourceName ?? 'library'}/${toPosixPath(path.relative(contentRoot, member))}`;
    pathsByKey.set(key, member);
    keys.push(key);
  }
  return keys;
}

/** Renders a relative path with forward slashes, so that a key reads the same on every platform. */
function toPosixPath(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

// endregion | Helpers
