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
import {
  extractInvocationEdges,
  extractOptionalInvocationTargets,
  locateInvocationTokens,
} from '../../src/lib/invocation-tokens.ts';
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
// those declarations in place. An optional token is exempt from that second property by construction: it names a
// target that need not deploy, so the pointer it renders is one the author accepted.
//
// `{rulebook:<slug>}` is out of scope. The render pass rejects one in a support entry outright, since `install` ships
// such an entry having resolved no declaration to render it against.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;
const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures', 'support-entry-tokens');

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

    const files = await listSupportEntryFiles(CONTENT_ROOT);
    for (const file of files) {
      const body = await readFile(file, 'utf8');
      // Optional targets join the required ones here: the closure walk never reads a support entry, so nothing else
      // catches a slug that no longer names an artifact, whichever form the token takes. Each slug carries its form, so
      // the reported token is the string the author finds in the file.
      const edges = extractInvocationEdges(body);
      const optional = extractOptionalInvocationTargets(body);
      const relative = path.relative(CONTENT_ROOT, file);
      const named = [
        ...edges.skills.map((slug) => ({ kind: 'skill' as const, slug, marker: '' })),
        ...optional.skills.map((slug) => ({ kind: 'skill' as const, slug, marker: '?' })),
        ...edges.subagents.map((slug) => ({ kind: 'subagent' as const, slug, marker: '' })),
        ...optional.subagents.map((slug) => ({ kind: 'subagent' as const, slug, marker: '?' })),
      ];
      for (const { kind, slug, marker } of named) {
        const known = kind === 'skill' ? skills : subagents;
        if (!known.has(slug)) {
          violations.push(`${relative} -> {${kind}${marker}:${slug}}`);
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
    const files = (await listSupportEntryFiles(CONTENT_ROOT)).map((file) => path.relative(CONTENT_ROOT, file));

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
//
// An optional token carries no requirement at all. Compelling a declaration for one would deploy the target the marker
// exists to leave out.
describe('support entry token declarations', () => {
  it('are declared by every host that links into the section carrying them', async () => {
    const violations = await findUndeclaredTokens(CONTENT_ROOT);

    const message =
      'A host links into a support-entry section carrying an invocation token whose target its closure never ' +
      'reaches, so the entry ships a pointer to an artifact the consumer does not install. Declare the target ' +
      `under the host's \`dependencies:\`:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });

  // The assertion above reports only what it fails to reach, and no support entry in the library carries a required
  // token today: every one naming an Atlassian skill is written in the optional form, which carries no requirement. So
  // the live walk has nothing to judge, and these two fixtures are what prove the walk still judges correctly when a
  // support entry next carries one.
  describe('detection', () => {
    it('reports a host that declares none of what the section it links names', async () => {
      const violations = await findUndeclaredTokens(path.join(FIXTURES_DIR, 'undeclared'));

      expect(violations).toEqual(['skill:host -> skill:target']);
    });

    it('accepts a host that declares it', async () => {
      const violations = await findUndeclaredTokens(path.join(FIXTURES_DIR, 'declared'));

      expect(violations).toEqual([]);
    });
  });
});

// region | Helpers

/**
 * Reports each host whose closure fails to reach an artifact named by a required invocation token in a support-entry
 * section the host links. One walk serves the library and the fixtures alike, so what the fixtures prove about the
 * detection is what the library is held to.
 */
async function findUndeclaredTokens(root: string): Promise<Array<string>> {
  const carriers = await mapTokenCarriers(root);
  const hosts = await listLinkingHosts(root);
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

    const closure = await resolveClosure({ [host.type]: [host.slug] }, libraryResolver(root));
    const reached = new Set<ArtifactId>([
      ...closure.skills.map((slug) => `skill:${slug}`),
      ...closure.subagents.map((slug) => `subagent:${slug}`),
    ]);
    const missing = [...required].toSorted().filter((id) => !reached.has(id));
    violations.push(...missing.map((id) => `${host.type}:${host.slug} -> ${id}`));
  }
  return violations.toSorted();
}

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
async function listLinkingHosts(root: string): Promise<ReadonlyArray<LinkingHost>> {
  const skillsRoot = path.join(root, 'skills');
  const subagentsRoot = path.join(root, 'subagents');
  const supportFiles = new Set(await listSupportEntryFiles(root));
  const hosts: Array<LinkingHost> = [];

  const candidates: Array<{ type: 'skill' | 'subagent'; slug: string; file: string }> = [
    ...(await listSkillDirectories(skillsRoot)).map((slug) => ({
      type: 'skill' as const,
      slug,
      file: path.join(skillsRoot, slug, 'SKILL.md'),
    })),
    ...(await listVisibleMarkdownFiles(subagentsRoot)).map((file) => ({
      type: 'subagent' as const,
      slug: path.basename(file, '.md'),
      file: path.join(subagentsRoot, file),
    })),
  ];

  for (const candidate of candidates) {
    const body = normalizeForAnchorScan(await expandIncludes(candidate.file, root));
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
async function listSupportEntryFiles(root: string): Promise<ReadonlyArray<string>> {
  const skillsRoot = path.join(root, 'skills');
  const files: Array<string> = [];
  const entries = await listSupportEntries(skillsRoot);
  for (const entry of entries) {
    const target = path.join(skillsRoot, entry);
    if ((await stat(target)).isDirectory()) {
      files.push(...(await listMarkdownFiles(target)));
    } else if (target.endsWith('.md')) {
      files.push(target);
    }
  }
  return files;
}

/**
 * Maps each support entry to the artifacts its required invocation tokens name, keyed by every heading slug whose
 * section encloses the token. A token under `### Jira` inside `## Platform-specific write` is listed under both, so a
 * host linking either heading carries the same requirement. An optional token is left out: It asserts the target may
 * be absent, which is the opposite of what the host declaration it would compel guarantees.
 */
async function mapTokenCarriers(
  root: string,
): Promise<ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<ArtifactId>>>> {
  const carriers = new Map<string, Map<string, Set<ArtifactId>>>();
  const files = await listSupportEntryFiles(root);

  for (const file of files) {
    const body = normalizeForAnchorScan(await readFile(file, 'utf8'));
    const headings = collectHeadingPositions(body);
    const sections = new Map<string, Set<ArtifactId>>();

    const tokens = locateInvocationTokens(body).filter((token) => token.kind !== 'rulebook' && !token.optional);
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
