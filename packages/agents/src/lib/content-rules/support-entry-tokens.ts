import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { collectHeadingPositions, type HeadingPosition, normalizeForAnchorScan } from '../anchor-resolution.ts';
import { artifactFrontmatterPath } from '../artifact-types.ts';
import type { ContentDefect } from '../content-defects.ts';
import type { SourceResolver } from '../content-sources.ts';
import { resolveClosure } from '../dependency-resolver.ts';
import { expandIncludes } from '../directive-expander.ts';
import { listMarkdownFilesRecursively, listVisibleMarkdownFiles } from '../fs-helpers.ts';
import { locateInvocationTokens } from '../invocation-tokens.ts';
import { listSkillDirectories, listSupportEntries } from '../library-catalog.ts';
import { isRewritableLinkTarget, MARKDOWN_LINK_REGEX } from '../path-rewriter.ts';
import { type RuleContext, toRootRelative } from './rule-context.ts';

/** An artifact addressed as `<type>:<slug>`, the form used by the resolver's own errors. */
type ArtifactId = string;

/** A skill or subagent that can link into a support entry, with the file that holds its body. */
interface Host {
  readonly type: 'skill' | 'subagent';
  readonly slug: string;
  readonly file: string;
}

/** Finds the section map of the support entry that a link names, or `undefined` when the link names none. */
type CarrierLookup = (file: string) => Promise<SectionCarriers | undefined>;

/** For one support entry, the artifacts named by its required tokens, keyed by every enclosing heading slug. */
type SectionCarriers = ReadonlyMap<string, ReadonlySet<ArtifactId>>;

/**
 * Reports the two ways in which a support entry's invocation token can ship a pointer to nothing. The closure walk
 * never reads a support entry, because one is reached by a link rather than inlined, so neither is caught elsewhere.
 *
 * - A `{skill:…}` or `{subagent:…}` token, required or optional, that resolves from neither the root nor the library,
 *   reported against the entry.
 * - A skill or subagent whose include-expanded body links into a support-entry section carrying a required token, and
 *   whose closure does not reach the token's target, reported against the host. The entry may be the root's or, at
 *   the same root-relative path, the library's, since a link resolves against both. A support entry ships
 *   unconditionally, so the host's `dependencies:` declaration is what brings the target along. A token counts in its
 *   own section and every section enclosing it, since a link to an ancestor heading reaches it too. An optional token
 *   does not carry any requirement: Compelling a declaration would deploy the target that the marker exists to leave out.
 *
 * `{rulebook:…}` tokens are out of scope: The render pass rejects one in a support entry outright.
 */
export async function findSupportEntryTokenDefects({
  root,
  libraryDir,
  resolver,
}: RuleContext): Promise<ReadonlyArray<ContentDefect>> {
  const defects: Array<ContentDefect> = [];
  const supportFiles = await listSupportEntryFiles(root);

  const carriers = new Map<string, SectionCarriers>();
  for (const file of supportFiles) {
    const relativePath = toRootRelative(root, file);
    let body: string;
    try {
      body = await readFile(file, 'utf8');
    } catch (error: unknown) {
      defects.push({ file: relativePath, kind: 'dependency', detail: describeError(error) });
      continue;
    }
    defects.push(...(await findUnresolvedTokens(body, relativePath, resolver)));
    carriers.set(file, mapTokenCarriers(body));
  }

  const lookup = createCarrierLookup(root, libraryDir, carriers);
  defects.push(...(await findUndeclaredTargets(root, resolver, lookup)));
  return defects;
}

// region | Helpers

/**
 * Collects the artifacts that a host must reach because it links into a support-entry section carrying a required
 * token, each mapped to the first link target that requires it.
 */
async function collectRequiredTargets(
  host: Host,
  root: string,
  lookup: CarrierLookup,
): Promise<ReadonlyMap<ArtifactId, string>> {
  const required = new Map<ArtifactId, string>();
  const body = normalizeForAnchorScan(await expandIncludes(host.file, root));
  for (const match of body.matchAll(MARKDOWN_LINK_REGEX)) {
    const target = match[2];
    if (target === undefined || !isRewritableLinkTarget(target)) {
      continue;
    }
    const [pathPart, section] = target.split('#', 2);
    if (pathPart === undefined || section === undefined) {
      continue;
    }
    const carried = (await lookup(path.resolve(path.dirname(host.file), pathPart)))?.get(section) ?? [];
    for (const id of carried) {
      if (!required.has(id)) {
        required.set(id, target);
      }
    }
  }
  return required;
}

/**
 * Creates the lookup that resolves a linked file to its section map: the root's own support entry, or else, when the
 * root does not contain the file, the library's support entry at the same root-relative path. A library entry is read
 * on first use and cached.
 */
function createCarrierLookup(
  root: string,
  libraryDir: string,
  rootCarriers: ReadonlyMap<string, SectionCarriers>,
): CarrierLookup {
  const libraryCarriers = new Map<string, SectionCarriers | undefined>();
  let librarySupportFiles: ReadonlySet<string> | undefined;

  return async (file) => {
    const relativePath = path.relative(root, file);
    const outsideRoot = relativePath.startsWith('..') || path.isAbsolute(relativePath);
    if (rootCarriers.has(file) || outsideRoot || existsSync(file)) {
      return rootCarriers.get(file);
    }

    const libraryFile = path.join(libraryDir, relativePath);
    if (!libraryCarriers.has(libraryFile)) {
      librarySupportFiles ??= new Set(await listSupportEntryFiles(libraryDir));
      let sections: SectionCarriers | undefined;
      if (librarySupportFiles.has(libraryFile)) {
        try {
          sections = mapTokenCarriers(await readFile(libraryFile, 'utf8'));
        } catch {
          // Leave an unreadable library entry without sections; an edit to the root cannot repair it.
        }
      }
      libraryCarriers.set(libraryFile, sections);
    }
    return libraryCarriers.get(libraryFile);
  };
}

/**
 * Reports each host whose closure fails to reach an artifact named by a required token in a support-entry section that
 * the host links, one defect per host and missing target.
 */
async function findUndeclaredTargets(
  root: string,
  resolver: SourceResolver,
  lookup: CarrierLookup,
): Promise<ReadonlyArray<ContentDefect>> {
  const defects: Array<ContentDefect> = [];
  const hosts = await listHosts(root);
  for (const host of hosts) {
    const file = artifactFrontmatterPath(host.type, host.slug);
    let required: ReadonlyMap<ArtifactId, string>;
    try {
      required = await collectRequiredTargets(host, root, lookup);
    } catch (error: unknown) {
      defects.push({ file, kind: 'dependency', detail: describeError(error) });
      continue;
    }
    if (required.size === 0) {
      continue;
    }

    let reached: ReadonlySet<ArtifactId>;
    try {
      const closure = await resolveClosure({ [host.type]: [host.slug] }, resolver);
      reached = new Set([
        ...closure.skills.map((slug) => `skill:${slug}`),
        ...closure.subagents.map((slug) => `subagent:${slug}`),
      ]);
    } catch {
      // A closure that does not resolve is a dependency defect that the closure pass already reports.
      continue;
    }

    const sorted = [...required].toSorted(([a], [b]) => a.localeCompare(b));
    for (const [id, link] of sorted) {
      if (!reached.has(id)) {
        defects.push({
          file,
          kind: 'dependency',
          detail:
            `Links to \`${link}\`, a support-entry section invoking ${id}, which this artifact's closure does not ` +
            'reach, so the entry ships a pointer to an artifact that a consumer does not install. Declare it under ' +
            '`dependencies:`.',
        });
      }
    }
  }
  return defects;
}

/** Reports each skill or subagent token in a support entry that resolves from neither the root nor the library. */
async function findUnresolvedTokens(
  body: string,
  relativePath: string,
  resolver: SourceResolver,
): Promise<ReadonlyArray<ContentDefect>> {
  const defects: Array<ContentDefect> = [];
  const seen = new Set<string>();
  for (const token of locateInvocationTokens(body)) {
    if (token.kind === 'rulebook') {
      continue;
    }
    const written = `{${token.kind}${token.optional ? '?' : ''}:${token.slug}}`;
    if (seen.has(written)) {
      continue;
    }
    seen.add(written);
    if ((await resolver.resolve(token.kind, token.slug)) === undefined) {
      const line = body.slice(0, token.index).split('\n').length;
      defects.push({
        file: relativePath,
        kind: 'dependency',
        detail: `Line ${line} invokes ${written}, which resolves from neither the content root nor the library.`,
      });
    }
  }
  return defects;
}

/**
 * Lists the anchor slugs of every heading whose section encloses `index`, outermost first. A heading opens a section
 * that runs until the next heading of its level or shallower.
 */
function listEnclosingSlugs(headings: ReadonlyArray<HeadingPosition>, index: number): ReadonlyArray<string> {
  const open: Array<HeadingPosition> = [];
  for (const heading of headings) {
    if (heading.index > index) {
      break;
    }
    while ((open.at(-1)?.level ?? 0) >= heading.level) {
      open.pop();
    }
    open.push(heading);
  }
  return open.map((heading) => heading.slug);
}

/** Lists the root's skills and subagents, each with the file that holds its body. */
async function listHosts(root: string): Promise<ReadonlyArray<Host>> {
  const skillsDir = path.join(root, 'skills');
  const subagentsDir = path.join(root, 'subagents');
  return [
    ...(await listSkillDirectories(skillsDir)).map((slug) => ({
      type: 'skill' as const,
      slug,
      file: path.join(skillsDir, slug, 'SKILL.md'),
    })),
    ...(await listVisibleMarkdownFiles(subagentsDir)).map((name) => ({
      type: 'subagent' as const,
      slug: path.basename(name, '.md'),
      file: path.join(subagentsDir, name),
    })),
  ];
}

/**
 * Lists every Markdown file under `skills/` that ships as a support entry rather than as part of a skill. An entry is
 * a directory or a plain file, so the walk decides on what the entry is rather than on its name.
 */
async function listSupportEntryFiles(root: string): Promise<ReadonlyArray<string>> {
  const skillsDir = path.join(root, 'skills');
  const files: Array<string> = [];
  const entries = await listSupportEntries(skillsDir);
  for (const entry of entries) {
    const target = path.join(skillsDir, entry);
    if ((await stat(target)).isDirectory()) {
      files.push(...(await listMarkdownFilesRecursively(target)));
    } else if (target.endsWith('.md')) {
      files.push(target);
    }
  }
  return files;
}

/** Maps each heading slug in a support entry to the artifacts named by the required tokens that its section encloses. */
function mapTokenCarriers(body: string): SectionCarriers {
  const normalized = normalizeForAnchorScan(body);
  const headings = collectHeadingPositions(normalized);
  const sections = new Map<string, Set<ArtifactId>>();

  const tokens = locateInvocationTokens(normalized).filter((token) => token.kind !== 'rulebook' && !token.optional);
  for (const token of tokens) {
    for (const heading of listEnclosingSlugs(headings, token.index)) {
      const ids = sections.get(heading) ?? new Set<ArtifactId>();
      ids.add(`${token.kind}:${token.slug}`);
      sections.set(heading, ids);
    }
  }
  return sections;
}

// endregion | Helpers
