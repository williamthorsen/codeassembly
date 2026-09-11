/**
 * Target and transitive-file resolution for the streamline-guidance helper.
 *
 * A target is a Markdown guidance file in the repository, named directly or through a directory, with a deployed copy
 * standing for its source. A transitive file is one that a target's content reaches: an include, recursively, or a file
 * to which the target or one of its includes links. Links inside a linked file are not followed, and an invocation
 * token names separately loaded content, so neither contributes a file.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

import { DirectiveExpansionError, listIncludeTargets } from '../lib/directive-expander.ts';
import { MARKDOWN_LINK_REGEX } from '../lib/path-rewriter.ts';
import { isInsideArtifactBaseDir, resolveRootArtifactBaseDir } from '../shared/artifact-base-dir.ts';
import { findDeployedSource, isDeployedCopy } from './deployed-source.ts';
import { listWorkingTreeFiles } from './list-working-tree-files.ts';
import { isLive } from './record.ts';
import type {
  DeclinedPhrase,
  DeclineRecord,
  GuidanceFile,
  LineRange,
  RejectedPath,
  ResolveSuccess,
  TransitiveEdge,
  TransitiveFile,
} from './types.ts';

/** Raised when a target's include directives cannot be resolved. */
export class InvalidIncludeError extends Error {}

/** Raised when the helper runs somewhere git does not track. */
export class NotARepositoryError extends Error {}

/** Returns the real path of the repository's top level. Throws {@link NotARepositoryError} outside a working tree. */
export function findRepositoryRoot(cwd: string): string {
  try {
    const stdout = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return realpathSync(stdout.trim());
  } catch (error) {
    throw new NotARepositoryError(`${cwd} is not inside a git working tree`, { cause: error });
  }
}

/**
 * Resolves the named paths into targets and transitive files, with their sizes, their state in git, their generated
 * regions, and the record's live declined cuts against them. A path that cannot be a target is reported rather than
 * failing the run. Throws {@link InvalidIncludeError} for a target whose includes do not resolve.
 */
export async function resolveGuidance(input: {
  cwd: string;
  home: string;
  paths: readonly string[];
  record: DeclineRecord;
  root: string;
}): Promise<ResolveSuccess> {
  const context: ResolutionContext = {
    artifactBaseDir: resolveRealPath(await resolveRootArtifactBaseDir(input.root, input.home)),
    contentRoots: listContentRoots(input.root),
    home: input.home,
    root: input.root,
  };

  const named = new Map<string, string | undefined>();
  const rejected: RejectedPath[] = [];
  for (const namedPath of input.paths) {
    for (const outcome of resolveNamedPath(namedPath, input.cwd, context)) {
      if ('reason' in outcome) {
        rejected.push(outcome);
      } else if (!named.has(outcome.file)) {
        named.set(outcome.file, outcome.redirectedFrom);
      }
    }
  }

  const edges = await collectTransitiveEdges(named.keys().toArray(), context);
  for (const file of named.keys()) {
    edges.delete(file);
  }

  const files = [...named.keys(), ...edges.keys()];
  const dirty = listDirtyFiles(input.root, files);

  const targets = [...named].map(([file, redirectedFrom]) => ({
    ...describeFile(file, context, dirty),
    ...(redirectedFrom !== undefined && { redirectedFrom }),
  }));
  const transitive: TransitiveFile[] = [...edges]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([file, via]) => ({ ...describeFile(file, context, dirty), via }));

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

/** Names the manifest file that marks a directory as a content root. */
const CONTENT_ROOT_MANIFEST = 'codeassembly-content.yaml';

/** Matches the start marker of a region that a deployment rewrites, whose captured group names the region. */
const GENERATED_REGION_START_REGEX =
  /^[ \t]*<!-- codeassembly-(ambient|guidance-hook:[a-z][a-z0-9-]*):start -->[ \t]*$/;

/** Matches a `{harness_home_dir}` reference into a deployed tree, whose captured group is the path beneath the home. */
const HARNESS_HOME_REFERENCE_REGEX = /\{harness_home_dir\}\/((?:scripts|skills)\/[^\s`'"()<>[\]]+)/g;

/** Output cap for one git listing, sized past what a large repository produces. */
const GIT_MAX_BUFFER = 256 * 1_024 * 1_024;

/** The values that resolution fixes for one run. */
interface ResolutionContext {
  artifactBaseDir: string;
  contentRoots: readonly string[];
  home: string;
  root: string;
}

/** A path accepted as a target, relative to the repository root. */
interface AcceptedFile {
  file: string;
  redirectedFrom?: string;
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
    return { path: namedPath, reason: 'sealed-artifact' };
  }

  const content = readFileSync(absolutePath, 'utf8');
  if (!isDeployedCopy(absolutePath, content)) {
    return isInside(absolutePath, context.root)
      ? { file: path.relative(context.root, absolutePath) }
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
  return { file: path.relative(context.root, source), redirectedFrom: namedPath };
}

/**
 * Collects the transitive files reached from the targets, each with the edges that reach it. A link inside an included
 * file resolves against the target's directory, because an include is rendered into the target's body and its links
 * are rewritten there.
 */
async function collectTransitiveEdges(
  targets: readonly string[],
  context: ResolutionContext,
): Promise<Map<string, TransitiveEdge[]>> {
  const edges = new Map<string, TransitiveEdge[]>();
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
    const expanded =
      contentRoot === undefined
        ? [targetPath]
        : await listExpandedFiles(targetPath, contentRoot, (file, includer) => {
            addEdge(path.relative(context.root, file), {
              from: path.relative(context.root, includer),
              kind: 'include',
            });
          });

    for (const file of expanded) {
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

  return edges;
}

/** Describes one repository-relative file: its size, its state in git, and its generated regions. */
function describeFile(file: string, context: ResolutionContext, dirty: ReadonlySet<string>): GuidanceFile {
  const absolutePath = path.join(context.root, file);
  return {
    file,
    bytes: statSync(absolutePath).size,
    dirty: dirty.has(file),
    generatedRegions: findGeneratedRegions(readFileSync(absolutePath, 'utf8')),
  };
}

/** Returns the innermost content root containing a file, or undefined where none does. */
function findContentRoot(file: string, contentRoots: readonly string[]): string | undefined {
  return contentRoots
    .filter((contentRoot) => isInside(file, contentRoot))
    .toSorted((left, right) => right.length - left.length)[0];
}

/** Returns the line ranges of every region that a deployment rewrites, running to the end where no end marker closes one. */
function findGeneratedRegions(content: string): LineRange[] {
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

/** Reports whether a path is the directory itself or lies beneath it. */
function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** Lists the absolute directories of every content root in the repository, tracked or not yet tracked. */
function listContentRoots(root: string): string[] {
  return listWorkingTreeFiles(root, [`*${CONTENT_ROOT_MANIFEST}`])
    .filter((file) => path.basename(file) === CONTENT_ROOT_MANIFEST)
    .map((file) => path.join(root, path.dirname(file)));
}

/** Returns the repository-relative files that git reports as changed or untracked, among the given files. */
function listDirtyFiles(root: string, files: readonly string[]): Set<string> {
  if (files.length === 0) {
    return new Set();
  }
  const stdout = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...files], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  const dirty = new Set<string>();
  const entries = stdout.split('\u{0}');
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] ?? '';
    if (entry.length < 4) continue;
    dirty.add(entry.slice(3));
    // A rename or copy entry is followed by its original path, which is not itself an entry.
    if (/[CR]/.test(entry.slice(0, 2))) index += 1;
  }
  return dirty;
}

/**
 * Lists a target and every file that its includes reach, in discovery order, calling `onInclude` once per edge. Throws
 * {@link InvalidIncludeError} where a directive does not resolve.
 */
async function listExpandedFiles(
  target: string,
  contentRoot: string,
  onInclude: (file: string, includer: string) => void,
): Promise<string[]> {
  const visited = new Set<string>([target]);
  const pending = [target];
  for (let file = pending.shift(); file !== undefined; file = pending.shift()) {
    let includes: string[];
    try {
      includes = await listIncludeTargets(file, contentRoot);
    } catch (error) {
      if (!(error instanceof DirectiveExpansionError)) throw error;
      throw new InvalidIncludeError(error.message, { cause: error });
    }
    for (const include of includes) {
      onInclude(include, file);
      if (!visited.has(include)) {
        visited.add(include);
        pending.push(include);
      }
    }
  }
  return [...visited];
}

/**
 * Lists the existing Markdown files to which content links: Markdown links resolved against the host's directory, and
 * `{harness_home_dir}` references mapped into the content root, whose tree is what deploys beneath the harness home.
 */
function listLinkedPaths(
  content: string,
  input: { contentRoot: string | undefined; home: string; hostDir: string },
): string[] {
  const found = new Set<string>();

  for (const match of content.matchAll(MARKDOWN_LINK_REGEX)) {
    const resolved = resolveLinkTarget(match[2] ?? '', input);
    if (resolved !== undefined) found.add(resolved);
  }
  if (input.contentRoot !== undefined) {
    for (const match of content.matchAll(HARNESS_HOME_REFERENCE_REGEX)) {
      found.add(path.join(input.contentRoot, trimTrailingPunctuation(match[1] ?? '')));
    }
  }

  return [...found].filter(
    (candidate) =>
      path.extname(candidate).toLowerCase() === '.md' && existsSync(candidate) && statSync(candidate).isFile(),
  );
}

/** Lists the Markdown files in the working tree that git tracks or would track beneath a repository-relative directory. */
function listMarkdownFilesUnder(root: string, directory: string): string[] {
  return listWorkingTreeFiles(root, [directory === '' ? '.' : directory]).filter(
    (file) => path.extname(file).toLowerCase() === '.md',
  );
}

/**
 * Resolves a Markdown link target to an absolute path, or undefined for a target naming no local file: a URL, an
 * anchor, or a template variable other than `{harness_home_dir}`.
 */
function resolveLinkTarget(
  rawTarget: string,
  input: { contentRoot: string | undefined; home: string; hostDir: string },
): string | undefined {
  const target = (rawTarget.trim().split(/\s/, 1)[0] ?? '').split('#', 1)[0] ?? '';
  if (target === '' || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
    return undefined;
  }
  if (target.startsWith('{harness_home_dir}/')) {
    const beneath = target.slice('{harness_home_dir}/'.length);
    return input.contentRoot !== undefined && /^(?:scripts|skills)\//.test(beneath)
      ? path.join(input.contentRoot, beneath)
      : undefined;
  }
  if (target.startsWith('{')) {
    return undefined;
  }
  if (target.startsWith('~/')) {
    return path.join(input.home, target.slice(2));
  }
  return path.resolve(input.hostDir, target);
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
  return listMarkdownFilesUnder(context.root, path.relative(context.root, realPath)).map((file) =>
    classifyFile(path.join(context.root, file), file, context),
  );
}

/** Returns a path's real path where it exists, and the path unchanged where it does not. */
function resolveRealPath(candidate: string): string {
  return existsSync(candidate) ? realpathSync(candidate) : candidate;
}

/** Projects the record's declined cuts that are still live against the files in this run. */
function selectLiveDeclined(record: DeclineRecord, files: ReadonlySet<string>, root: string): DeclinedPhrase[] {
  return record.declined
    .filter((entry) => files.has(entry.file) && isLive(entry, readFileSync(path.join(root, entry.file), 'utf8')))
    .map(({ file, phrase, class: cutClass }) => ({ file, phrase, class: cutClass }));
}

/** Drops the sentence punctuation that prose can leave after a bare path. */
function trimTrailingPunctuation(reference: string): string {
  return reference.replace(/[.,;:]+$/, '');
}

// endregion | Helpers
