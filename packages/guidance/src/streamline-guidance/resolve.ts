/**
 * Target and transitive-file resolution for the streamline-guidance helper.
 *
 * A target is a Markdown guidance file in the repository, named directly or through a directory, with a deployed copy
 * standing for its source. A transitive file is one that a target's content reaches: an include, recursively, or a file
 * to which the target or one of its includes links. Links inside a linked file are not followed, and an invocation
 * token names separately loaded content, so neither contributes a file.
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

import { isInsideArtifactBaseDir, resolveRootArtifactBaseDir } from '../shared/artifact-base-dir.ts';
import { findContentRoot, isInside, listContentRoots } from './content-roots.ts';
import { findDeployedSource, isDeployedCopy } from './deployed-source.ts';
import type { StreamlineGit } from './git.ts';
import { listLinkedPaths } from './links.ts';
import { listWorkingTreeFiles } from './list-working-tree-files.ts';
import { findGeneratedRegions, loadIncludeGraph, measureFiles, type MeasurementContext } from './measure.ts';
import { isLive } from './record.ts';
import type {
  DeclinedPhrase,
  GuidanceFile,
  GuidanceRecord,
  LastReview,
  RejectedPath,
  ResolveSuccess,
  TransitiveEdge,
  TransitiveFile,
} from './types.ts';

/** Returns the real path of the repository's top level. Throws {@link NotARepositoryError} outside a working tree. */
export function findRepositoryRoot(cwd: string, git: StreamlineGit): string {
  const topLevel = git.findTopLevel(cwd);
  if (topLevel === undefined) {
    throw new NotARepositoryError(`${cwd} is not inside a git working tree`);
  }
  return realpathSync(topLevel);
}

/** Raised when the helper runs somewhere git does not track. */
export class NotARepositoryError extends Error {}

/**
 * Resolves the named paths into targets and transitive files, with the record's live declined cuts against them. A
 * path that cannot be a target, including one whose includes do not resolve, is reported rather than failing the run.
 */
export async function resolveGuidance(input: {
  cwd: string;
  git: StreamlineGit;
  home: string;
  paths: readonly string[];
  record: GuidanceRecord;
  root: string;
}): Promise<ResolveSuccess> {
  const context: ResolutionContext = {
    artifactBaseDir: resolveRealPath(await resolveRootArtifactBaseDir(input.root, input.home)),
    contentRoots: listContentRoots(input.root, input.git),
    git: input.git,
    graphs: new Map(),
    home: input.home,
    root: input.root,
  };

  const named = new Map<string, AcceptedFile>();
  const rejected: RejectedPath[] = [];
  for (const namedPath of input.paths) {
    for (const outcome of resolveNamedPath(namedPath, input.cwd, context)) {
      if ('reason' in outcome) {
        rejected.push(outcome);
      } else if (!named.has(outcome.file)) {
        named.set(outcome.file, outcome);
      }
    }
  }

  const { edges, unresolved } = await collectTransitiveEdges(named.keys().toArray(), context);
  for (const file of unresolved) {
    rejected.push({ path: named.get(file)?.namedPath ?? file, reason: 'unresolved-include' });
    named.delete(file);
  }
  for (const file of named.keys()) {
    edges.delete(file);
  }

  const files = [...named.keys(), ...edges.keys()];
  const measures: FileMeasures = {
    deployedBytes: await measureFiles(files, context),
    dirty: input.git.listChangedFiles(input.root, files),
    reviews: mapLastReviews(input.record),
  };

  const targets = named
    .values()
    .map(({ file, redirectedFrom }) => ({
      ...describeFile(file, context, measures),
      ...(redirectedFrom !== undefined && { redirectedFrom }),
    }))
    .toArray();
  const transitive: TransitiveFile[] = [...edges]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([file, via]) => ({ ...describeFile(file, context, measures), via }));

  return {
    ok: true,
    root: input.root,
    targets,
    transitive,
    declined: selectLiveDeclined(input.record, new Set(files), input.root),
    rejected,
  };
}

// region | Helpers

/** A file accepted as a target, identified by its repository-relative path. */
interface AcceptedFile {
  file: string;
  namedPath: string;
  redirectedFrom?: string;
}

/** The per-file measurements that one run takes in a batch, keyed by repository-relative path. */
interface FileMeasures {
  deployedBytes: ReadonlyMap<string, number>;
  dirty: ReadonlySet<string>;
  reviews: ReadonlyMap<string, LastReview>;
}

/** The values that resolution fixes for one run. */
interface ResolutionContext extends MeasurementContext {
  artifactBaseDir: string;
  home: string;
}

/**
 * Classifies one file as a target or a rejection. A deployed copy stands for its source, which must itself be an
 * authored Markdown file in the repository.
 */
function classifyFile(
  absolutePath: string,
  namedPath: string,
  context: ResolutionContext,
): AcceptedFile | RejectedPath {
  if (path.extname(absolutePath).toLowerCase() !== '.md') {
    return { path: namedPath, reason: 'not-markdown' };
  }
  if (isInsideArtifactBaseDir(absolutePath, context.artifactBaseDir)) {
    return { path: namedPath, reason: 'saved-artifact' };
  }

  const content = readFileSync(absolutePath, 'utf8');
  if (!isDeployedCopy(absolutePath, content)) {
    return isInside(absolutePath, context.root)
      ? { file: path.relative(context.root, absolutePath), namedPath }
      : { path: namedPath, reason: 'outside-repository' };
  }

  const lookup = findDeployedSource(content, context);
  if ('reason' in lookup) {
    return { path: namedPath, reason: lookup.reason };
  }
  const source = resolveRealPath(lookup.found);
  if (
    path.extname(source).toLowerCase() !== '.md' ||
    !isInside(source, context.root) ||
    isDeployedCopy(source, readFileSync(source, 'utf8'))
  ) {
    return { path: namedPath, reason: 'source-not-in-repository' };
  }
  return { file: path.relative(context.root, source), namedPath, redirectedFrom: namedPath };
}

/**
 * Collects the transitive files reached from the targets, each with the edges that reach it, and lists the targets
 * whose includes do not resolve, which do not contribute any edge. A link inside an included file resolves against
 * the target's directory, because an include is rendered into the target's body and its links are rewritten there.
 */
async function collectTransitiveEdges(
  targets: readonly string[],
  context: ResolutionContext,
): Promise<{ edges: Map<string, TransitiveEdge[]>; unresolved: string[] }> {
  const edges = new Map<string, TransitiveEdge[]>();
  const unresolved: string[] = [];
  function addEdge(file: string, edge: TransitiveEdge): void {
    const list = edges.get(file) ?? [];
    if (list.every((existing) => existing.from !== edge.from || existing.kind !== edge.kind)) {
      list.push(edge);
    }
    edges.set(file, list);
  }

  for (const target of targets) {
    const targetPath = path.join(context.root, target);
    const contentRoot = findContentRoot(targetPath, context.contentRoots);
    const graph = contentRoot === undefined ? undefined : await loadIncludeGraph(contentRoot, context);
    if (graph?.hasUnresolvedIncludes(targetPath) === true) {
      unresolved.push(target);
      continue;
    }

    const closure = graph?.listClosure(targetPath);
    const includes = closure?.includes ?? [];
    const reached = closure?.files ?? [targetPath];
    for (const { file, includer } of includes) {
      addEdge(path.relative(context.root, file), { from: path.relative(context.root, includer), kind: 'include' });
    }
    for (const file of reached) {
      const linked = listLinkedPaths(readFileSync(file, 'utf8'), {
        contentRoot,
        home: context.home,
        hostDir: path.dirname(targetPath),
      });
      for (const linkedPath of linked) {
        const outcome = classifyFile(resolveRealPath(linkedPath), linkedPath, context);
        if ('file' in outcome) {
          addEdge(outcome.file, { from: path.relative(context.root, file), kind: 'link' });
        }
      }
    }
  }

  return { edges, unresolved };
}

/** Describes one repository-relative file. */
function describeFile(file: string, context: ResolutionContext, measures: FileMeasures): GuidanceFile {
  const absolutePath = path.join(context.root, file);
  const deployedBytes = measures.deployedBytes.get(file);
  const lastReview = measures.reviews.get(file);
  return {
    file,
    bytes: statSync(absolutePath).size,
    ...(deployedBytes !== undefined && { deployedBytes }),
    dirty: measures.dirty.has(file),
    generatedRegions: findGeneratedRegions(readFileSync(absolutePath, 'utf8')),
    ...(lastReview !== undefined && { lastReview }),
  };
}

/** Lists the Markdown files in the working tree beneath a repository-relative directory. */
function listMarkdownFilesUnder(root: string, directory: string, git: StreamlineGit): string[] {
  return listWorkingTreeFiles(root, git, [directory === '' ? '.' : directory]).filter(
    (file) => path.extname(file).toLowerCase() === '.md',
  );
}

/** Maps each reviewed file to its most recent review, as `resolve` reports it. */
function mapLastReviews(record: GuidanceRecord): Map<string, LastReview> {
  return new Map(
    record.reviewed.map((entry) => [
      entry.file,
      {
        reviewedAt: entry['reviewed-at'],
        ...(entry['deployed-bytes'] !== undefined && { deployedBytes: entry['deployed-bytes'] }),
      },
    ]),
  );
}

/** Expands the paths that one argument names into accepted targets and rejections. */
function resolveNamedPath(
  namedPath: string,
  cwd: string,
  context: ResolutionContext,
): Array<AcceptedFile | RejectedPath> {
  const expanded = namedPath.startsWith('~/') ? path.join(context.home, namedPath.slice(2)) : namedPath;
  const absolutePath = path.resolve(cwd, expanded);
  if (!existsSync(absolutePath)) {
    return [{ path: namedPath, reason: 'not-found' }];
  }

  const realPath = resolveRealPath(absolutePath);
  if (!statSync(realPath).isDirectory()) {
    return [classifyFile(realPath, namedPath, context)];
  }
  if (!isInside(realPath, context.root)) {
    return [{ path: namedPath, reason: 'outside-repository' }];
  }
  return listMarkdownFilesUnder(context.root, path.relative(context.root, realPath), context.git).map((file) =>
    classifyFile(path.join(context.root, file), file, context),
  );
}

/** Returns a path's real path when it exists, and the path unchanged when it does not. */
function resolveRealPath(candidate: string): string {
  return existsSync(candidate) ? realpathSync(candidate) : candidate;
}

/** Selects the record's declined cuts that are still live in this run's files. */
function selectLiveDeclined(record: GuidanceRecord, files: ReadonlySet<string>, root: string): DeclinedPhrase[] {
  return record.declined
    .filter((entry) => files.has(entry.file) && isLive(entry, readFileSync(path.join(root, entry.file), 'utf8')))
    .map(({ file, phrase, class: cutClass }) => ({ file, phrase, class: cutClass }));
}

// endregion | Helpers
