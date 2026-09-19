/**
 * The include graph of one content root: what each Markdown file transitively includes, and how many documents each
 * included file reaches.
 *
 * A document is a Markdown file that deploys as itself. A partial deploys only inside the documents that include it,
 * so its reach is what a change to it costs. Both halves are properties of the whole root rather than of one file,
 * which is why the graph is built over the root and then queried.
 */
import path from 'node:path';

import { DirectiveExpansionError, listIncludeTargets } from './directive-expander.ts';
import { isTestDirectory, readDirEntriesRecursively } from './fs-helpers.ts';

/**
 * Builds the include graph of one content root. A file whose own directives do not resolve contributes no include
 * edge and is reported through `hasUnresolvedIncludes` rather than throwing, so one malformed directive leaves the
 * rest of the root queryable.
 */
export async function buildIncludeGraph(contentRoot: string): Promise<IncludeGraph> {
  const root = path.resolve(contentRoot);
  const files = await listMarkdownFiles(root);

  const unresolved = new Set<string>();
  const directIncludes = new Map<string, ReadonlyArray<string>>();
  await Promise.all(
    files.map(async (file) => {
      try {
        directIncludes.set(file, await listIncludeTargets(file, root));
      } catch (error) {
        if (!(error instanceof DirectiveExpansionError)) throw error;
        unresolved.add(file);
        directIncludes.set(file, []);
      }
    }),
  );

  function listClosure(file: string): IncludeClosure {
    return walkIncludes(path.resolve(file), directIncludes);
  }

  const documents = new Set(files.filter((file) => isDocument(path.relative(root, file))));
  const reach = new Map<string, number>();
  for (const document of documents) {
    for (const member of listClosure(document).files) {
      reach.set(member, (reach.get(member) ?? 0) + 1);
    }
  }

  return {
    documents,
    countReach: (file) => reach.get(path.resolve(file)) ?? 0,
    hasUnresolvedIncludes: (file) => listClosure(file).files.some((member) => unresolved.has(member)),
    listClosure,
  };
}

/** A file's transitive includes, with the edges that reach them. */
export interface IncludeClosure {
  /** The file itself, then every file that it transitively includes, in discovery order. */
  readonly files: ReadonlyArray<string>;
  /** Every include edge found on the walk, in discovery order, repeats of the same pair included once. */
  readonly includes: ReadonlyArray<IncludeEdge>;
}

/** One include edge: the included file and the file whose directive includes it, both as absolute paths. */
export interface IncludeEdge {
  readonly file: string;
  readonly includer: string;
}

/** One content root's include relationships, queried by absolute path. */
export interface IncludeGraph {
  /** The root's documents: the Markdown files that deploy as themselves rather than only inside their includers. */
  readonly documents: ReadonlySet<string>;
  /** Counts the documents whose transitive includes contain the file. */
  countReach(file: string): number;
  /** Reports whether the file, or anything that it transitively includes, has a directive that does not resolve. */
  hasUnresolvedIncludes(file: string): boolean;
  /** Lists the file and its transitive includes. A file outside the root reports itself and no include. */
  listClosure(file: string): IncludeClosure;
}

// region | Helpers

/** Directory names whose Markdown files deploy only inside the documents that include them, or not at all. */
const NON_DOCUMENT_DIRECTORY_NAMES: ReadonlySet<string> = new Set(['_harnesses', '_partials']);

/** Reports whether a root-relative path names a document rather than a partial, a retired tree, or test content. */
function isDocument(relativePath: string): boolean {
  return relativePath
    .split(/[/\\]/)
    .every((segment) => !NON_DOCUMENT_DIRECTORY_NAMES.has(segment) && !isTestDirectory(segment));
}

/**
 * Lists every Markdown file under the root at any depth, as absolute paths. Test content is walked too: Its
 * directives decide whether a file targeted there resolves, even though it counts toward no document's reach.
 */
async function listMarkdownFiles(root: string): Promise<Array<string>> {
  return (await readDirEntriesRecursively(root))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/** Walks a file's includes breadth-first, the visited set terminating a cycle. */
function walkIncludes(file: string, directIncludes: ReadonlyMap<string, ReadonlyArray<string>>): IncludeClosure {
  const visited = new Set<string>([file]);
  const includes: Array<IncludeEdge> = [];
  const pending = [file];
  for (let current = pending.shift(); current !== undefined; current = pending.shift()) {
    const targets = directIncludes.get(current) ?? [];
    for (const include of targets) {
      includes.push({ file: include, includer: current });
      if (!visited.has(include)) {
        visited.add(include);
        pending.push(include);
      }
    }
  }
  return { files: [...visited], includes };
}

// endregion | Helpers
