import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectHeadingPositions,
  type HeadingPosition,
  normalizeForAnchorScan,
} from '../../src/lib/anchor-resolution.ts';
import { libraryResolver } from '../../src/lib/content-sources.ts';
import { resolveClosure } from '../../src/lib/dependency-resolver.ts';
import { expandIncludes } from '../../src/lib/directive-expander.ts';
import { listVisibleMarkdownFiles } from '../../src/lib/fs-helpers.ts';
import { extractInvocationEdges, locateInvocationTokens } from '../../src/lib/invocation-tokens.ts';
import { enumerateCatalogSlugs, listSkillDirectories, listSupportEntries } from '../../src/lib/library-catalog.ts';
import { isRewritableLinkTarget, MARKDOWN_LINK_REGEX } from '../../src/lib/path-rewriter.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// A `{skill:<slug>}` token renders wherever a support entry does, but only a skill's or subagent's own include-expanded
// body contributes dependency edges. A support entry is reached by a link rather than inlined, so `dependency-resolver`
// never reads it and `validate` never resolves what its tokens name: a token naming an artifact that does not exist
// ships as a rendered sigil the agent follows to nothing. Resolving them against the catalog turns that into a failure.
//
// Existing in the library is the weaker of the two properties a rendered token needs. The other is that the artifact
// reaches the install: a support entry ships unconditionally, so a token whose target no declaration pulls in renders
// a pointer to a skill the consumer does not have. Nothing supplies that edge automatically, which leaves the
// `dependencies:` declaration on each linking skill as the whole mitigation, and the second suite below is what holds
// those declarations in place.
//
// `{rulebook:<slug>}` is out of scope. The render pass rejects one in a support entry outright, since `install` ships
// such an entry having resolved no declaration to render it against.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;
const SKILLS_ROOT = path.join(CONTENT_ROOT, 'skills');
const SUBAGENTS_ROOT = path.join(CONTENT_ROOT, 'subagents');

/** An artifact addressed as `<type>:<slug>`, the form the resolver's own errors use. */
type ArtifactId = string;

/** A host that links into a support entry, and the sections of it the host addresses. */
interface LinkingHost {
  readonly type: 'skill' | 'subagent';
  readonly slug: string;
  readonly links: ReadonlyArray<SupportLink>;
}

/** One link from a host into a support entry: the entry's path, and the heading slug the fragment names. */
interface SupportLink {
  readonly file: string;
  readonly section: string;
}

describe('support entry invocation tokens', () => {
  it('name artifacts the library contains', async () => {
    const catalog = await enumerateCatalogSlugs(CONTENT_ROOT);
    const skills = new Set(catalog.skill);
    const subagents = new Set(catalog.subagent);
    const violations: Array<string> = [];

    const files = await listSupportEntryFiles();
    for (const file of files) {
      const edges = extractInvocationEdges(await readFile(file, 'utf8'));
      const relative = path.relative(CONTENT_ROOT, file);
      for (const slug of edges.skills) {
        if (!skills.has(slug)) {
          violations.push(`${relative} -> {skill:${slug}}`);
        }
      }
      for (const slug of edges.subagents) {
        if (!subagents.has(slug)) {
          violations.push(`${relative} -> {subagent:${slug}}`);
        }
      }
    }

    const message =
      'A support entry carries an invocation token naming an artifact the library does not contain. Nothing else ' +
      `resolves a support entry's tokens, so it ships as a rendered pointer to nothing:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });

  // The assertion above only ever reports what it fails to find, so a walk that silently returned nothing would leave
  // the suite green and the guard gone. This pins the walk against an entry reached only by link.
  it('reaches a support entry reached only by link', async () => {
    const files = (await listSupportEntryFiles()).map((file) => path.relative(CONTENT_ROOT, file));

    expect(files).toContain('skills/_data/ticket-source-resolution.md');
  });
});

// A host addresses a support entry's section by a link fragment, and that is the granularity at which it dispatches an
// agent into a procedure. So the declaration is required of the hosts that name the section the token sits in, not of
// every host that links the file: ten skills link `ticket-source-resolution.md` bare for its resolution rules, and
// requiring each to declare a Jira editing skill would bloat every closure to satisfy a branch none of them takes.
//
// A token is attributed to its own section and to every section enclosing it, so a link to an ancestor heading carries
// the same requirement as a link to the subsection itself.
//
// One reach is not attributed: a token a host arrives at through a second support entry, since a support entry
// declares no dependencies of its own and the walk stops at the first hop.
describe('support entry token declarations', () => {
  it('are declared by every host that links into the section carrying them', async () => {
    const carriers = await mapTokenCarriers();
    const hosts = await listLinkingHosts();
    const violations: Array<string> = [];

    for (const host of hosts) {
      const required = new Set<ArtifactId>();
      for (const link of host.links) {
        const carried = carriers.get(link.file)?.get(link.section) ?? [];
        for (const id of carried) {
          required.add(id);
        }
      }
      if (required.size === 0) {
        continue;
      }

      const closure = await resolveClosure({ [host.type]: [host.slug] }, libraryResolver(CONTENT_ROOT));
      const reached = new Set<ArtifactId>([
        ...closure.skills.map((slug) => `skill:${slug}`),
        ...closure.subagents.map((slug) => `subagent:${slug}`),
      ]);
      const missing = [...required].toSorted().filter((id) => !reached.has(id));
      violations.push(...missing.map((id) => `${host.type}:${host.slug} -> ${id}`));
    }

    const message =
      'A host links into a support-entry section carrying an invocation token whose target its closure never ' +
      'reaches, so the entry ships a pointer to an artifact the consumer does not install. Declare the target ' +
      `under the host's \`dependencies:\`:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });

  // The assertion above reports only what it fails to reach, so a walk finding no linking host at all would pass. This
  // pins the one pairing the suite exists for.
  it('holds the declaration that carries the Jira write into ticket alignment', async () => {
    const hosts = await listLinkingHosts();
    const align = hosts.find((host) => host.slug === 'align-ticket-with-implementation');

    expect(align?.links).toContainEqual({
      file: path.join(SKILLS_ROOT, '_data', 'ticket-source-resolution.md'),
      section: 'platform-specific-write',
    });
  });
});

// region | Helpers

/**
 * Lists the anchor slugs of every heading whose section encloses `index`, outermost first. A heading opens a section
 * that runs until the next heading of its level or shallower, so the open headings at any point are the chain a link
 * fragment can address to reach that point.
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

/** Lists every skill and subagent whose include-expanded body links into a support entry, with the sections it names. */
async function listLinkingHosts(): Promise<ReadonlyArray<LinkingHost>> {
  const supportFiles = new Set(await listSupportEntryFiles());
  const hosts: Array<LinkingHost> = [];

  const candidates: Array<{ type: 'skill' | 'subagent'; slug: string; file: string }> = [
    ...(await listSkillDirectories(SKILLS_ROOT)).map((slug) => ({
      type: 'skill' as const,
      slug,
      file: path.join(SKILLS_ROOT, slug, 'SKILL.md'),
    })),
    ...(await listVisibleMarkdownFiles(SUBAGENTS_ROOT)).map((file) => ({
      type: 'subagent' as const,
      slug: path.basename(file, '.md'),
      file: path.join(SUBAGENTS_ROOT, file),
    })),
  ];

  for (const candidate of candidates) {
    const body = normalizeForAnchorScan(await expandIncludes(candidate.file, CONTENT_ROOT));
    const links: Array<SupportLink> = [];
    for (const match of body.matchAll(MARKDOWN_LINK_REGEX)) {
      const target = match[2];
      if (target === undefined || !isRewritableLinkTarget(target)) {
        continue;
      }
      const [pathPart, section] = target.split('#', 2);
      if (pathPart === undefined || section === undefined) {
        continue;
      }
      const file = path.resolve(path.dirname(candidate.file), pathPart);
      if (supportFiles.has(file)) {
        links.push({ file, section });
      }
    }
    if (links.length > 0) {
      hosts.push({ type: candidate.type, slug: candidate.slug, links });
    }
  }
  return hosts;
}

/**
 * Lists every Markdown file under `skills/` that ships as a support entry rather than as part of a skill.
 *
 * A support entry is a directory or a plain file, so the walk decides on what the entry is rather than on its name: a
 * `notes.json` beside `_data/` contributes no Markdown, where reading its suffix would send `readdir` at a file.
 */
async function listSupportEntryFiles(): Promise<ReadonlyArray<string>> {
  const files: Array<string> = [];
  const entries = await listSupportEntries(SKILLS_ROOT);
  for (const entry of entries) {
    const target = path.join(SKILLS_ROOT, entry);
    if ((await stat(target)).isDirectory()) {
      files.push(...(await listMarkdownFiles(target)));
    } else if (target.endsWith('.md')) {
      files.push(target);
    }
  }
  return files;
}

/**
 * Maps each support entry to the artifacts its invocation tokens name, keyed by every heading slug whose section
 * encloses the token. A token under `### Jira` inside `## Platform-specific write` is listed under both, so a host
 * linking either heading carries the same requirement.
 */
async function mapTokenCarriers(): Promise<ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<ArtifactId>>>> {
  const carriers = new Map<string, Map<string, Set<ArtifactId>>>();
  const files = await listSupportEntryFiles();

  for (const file of files) {
    const body = normalizeForAnchorScan(await readFile(file, 'utf8'));
    const headings = collectHeadingPositions(body);
    const sections = new Map<string, Set<ArtifactId>>();

    const tokens = locateInvocationTokens(body).filter((token) => token.kind !== 'rulebook');
    for (const token of tokens) {
      for (const heading of listEnclosingSlugs(headings, token.index)) {
        const ids = sections.get(heading) ?? new Set<ArtifactId>();
        ids.add(`${token.kind}:${token.slug}`);
        sections.set(heading, ids);
      }
    }
    if (sections.size > 0) {
      carriers.set(file, sections);
    }
  }
  return carriers;
}

// endregion | Helpers
