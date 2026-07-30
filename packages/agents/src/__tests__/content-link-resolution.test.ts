import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { expandIncludes } from '../lib/directive-expander.ts';
import { isRewritableLinkTarget, MARKDOWN_LINK_REGEX } from '../lib/path-rewriter.ts';
import { parseRulebookFile } from '../lib/rulebook-schema.ts';
import { renderRulebookBody } from '../lib/rulebook-transform.ts';

// A Markdown link in installable content is rewritten at install time by `rewriteMarkdownPaths`, which resolves a
// relative target against the *host* file's directory — the skill or subagent the link renders into, not the partial
// it may have been authored in — and leaves an anchor-only target untouched. A link whose target has moved or been
// deleted still installs cleanly, leaving the agent to follow a link to nothing. Resolving every link the way the
// installer does turns that into a build failure.
//
// Both halves of a link are checked: the file must exist, and any `#fragment` must name exactly one heading in the
// file it points into. Skills reach their inlined output-shaping specs through in-file anchors, so an unvalidated
// fragment is a dead locator repeated across every consumer.
//
// Host roots only. A `_partials/` file is never installed standalone, and its links are authored against the host that
// inlines it — checking one in isolation would misresolve every `../` it carries. Include expansion below reaches them
// through each host, which is the only context where they mean anything.
//
// `guidance/rulebooks/` is a host root because `sync` renders a rulebook body per harness and resolves its links the
// same way this test does: against the file's own place in the content tree. The rest of `guidance/` stays out of
// scope for the opposite reason. `_harnesses/` files are rewritten at install time, but anchored at the harness home
// they install into rather than at their source directory, so resolving one here against the source tree would
// misreport every link it carries. `shared/` installs verbatim to a harness-neutral location, which no rewritten path
// could name a harness in.
//
// A rulebook carries a second requirement the file-existence check cannot express: its target must be rooted in a tree
// that deploys under a harness home. A link to `subagents/canary.md` names a file that exists, so it satisfies
// everything above, and still fails every `sync`. The last suite below closes that gap over shipped rulebooks.
const RULEBOOK_ROOT = 'guidance/rulebooks';

const HOST_ROOTS: ReadonlyArray<string> = [RULEBOOK_ROOT, 'skills', 'subagents'];

const CONTENT_ROOT = new URL('../../content/', import.meta.url).pathname;

const HEADING_REGEX = /^#{1,6}\s+(.+?)\s*$/gm;

type Reason = 'ambiguous-anchor' | 'dead-anchor' | 'missing-file';

interface Violation {
  readonly file: string;
  readonly target: string;
  readonly reason: Reason;
}

/** Counts each heading slug in a body, so a fragment matching two headings is reported rather than silently resolved. */
function collectHeadingSlugs(body: string): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const match of body.matchAll(HEADING_REGEX)) {
    const slug = slugify(match[1] ?? '');
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return counts;
}

/** Recursively collects installable host `.md` files, skipping `_partials/` at any depth and dotfiles. */
async function collectHostFiles(dir: string, out: Array<string>): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '_partials' || entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectHostFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
}

async function findViolations(): Promise<ReadonlyArray<Violation>> {
  const hostFiles: Array<string> = [];
  for (const root of HOST_ROOTS) {
    await collectHostFiles(path.join(CONTENT_ROOT, root), hostFiles);
  }
  hostFiles.sort();

  const headingsByFile = new Map<string, ReadonlyMap<string, number>>();
  const violations: Array<Violation> = [];

  for (const hostFile of hostFiles) {
    const body = stripFencedBlocks(await expandIncludes(hostFile, CONTENT_ROOT));
    const file = path.relative(CONTENT_ROOT, hostFile);

    for (const match of body.matchAll(MARKDOWN_LINK_REGEX)) {
      // The rewriter's own set, plus anchor-only targets: those name no file to rewrite, but they do name a fragment
      // this test resolves against the host's own headings.
      const target = match[2];
      if (target === undefined || !(isRewritableLinkTarget(target) || target.startsWith('#'))) {
        continue;
      }

      const hashIndex = target.indexOf('#');
      const filePart = hashIndex === -1 ? target : target.slice(0, hashIndex);
      const fragment = hashIndex === -1 ? '' : target.slice(hashIndex + 1);

      // An anchor-only target points into the host's own body; anything else names a file to resolve first.
      const targetPath = filePart === '' ? hostFile : path.resolve(path.dirname(hostFile), filePart);
      if (!existsSync(targetPath)) {
        violations.push({ file, target, reason: 'missing-file' });
        continue;
      }

      // Only Markdown carries headings; a fragment on any other target has nothing to resolve against.
      if (fragment === '' || !targetPath.endsWith('.md')) {
        continue;
      }

      const headings = await readHeadingSlugs(targetPath, headingsByFile);
      const matches = headings.get(fragment) ?? 0;
      if (matches === 0) {
        violations.push({ file, target, reason: 'dead-anchor' });
      } else if (matches > 1) {
        violations.push({ file, target, reason: 'ambiguous-anchor' });
      }
    }
  }

  return violations;
}

function formatViolations(violations: ReadonlyArray<Violation>): string {
  if (violations.length === 0) {
    return '';
  }
  const header =
    `Found ${violations.length} unresolvable Markdown link(s). Each is resolved the way the install pipeline ` +
    `resolves it: a relative path against the host file's directory, and a fragment against the headings of the ` +
    `file it points into. A link authored in a partial is reported against every host that inlines it, so fix the ` +
    `partial rather than the host.`;
  const lines = violations.map((v) => `  [${v.reason}] ${v.file}: ${v.target}`);
  return [header, ...lines].join('\n');
}

async function readHeadingSlugs(
  file: string,
  cache: Map<string, ReadonlyMap<string, number>>,
): Promise<ReadonlyMap<string, number>> {
  const cached = cache.get(file);
  if (cached !== undefined) {
    return cached;
  }
  const slugs = collectHeadingSlugs(stripFencedBlocks(await expandIncludes(file, CONTENT_ROOT)));
  cache.set(file, slugs);
  return slugs;
}

/**
 * Derives a heading's anchor the way GitHub does: lowercase, drop everything but letters, numbers, spaces, and
 * hyphens, then map each remaining space to a hyphen. Runs of spaces are preserved rather than collapsed — stripping
 * punctuation between two spaces is what yields the double hyphen in an anchor such as `#finding-scheme-fwtrs--legacy-suffix`.
 */
function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .replaceAll(' ', '-');
}

/**
 * Blanks fenced code blocks. A fence illustrates output rather than declaring it, so a link or heading inside one is a
 * sample, not a target: `review-branch` prints a `## Specification consistency` heading inside its output-format fence,
 * which a naive scan would offer as a real anchor.
 */
function stripFencedBlocks(content: string): string {
  let inFence = false;
  return content
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return '';
      }
      return inFence ? '' : line;
    })
    .join('\n');
}

describe('installable-content link resolution', () => {
  let violations: ReadonlyArray<Violation> = [];

  beforeAll(async () => {
    violations = await findViolations();
  });

  it('every relative Markdown link in an installable host resolves to a real file', () => {
    const missing = violations.filter((v) => v.reason === 'missing-file');
    expect(missing, formatViolations(missing)).toEqual([]);
  });

  it('every anchor fragment resolves to exactly one heading in the file it points into', () => {
    const anchors = violations.filter((v) => v.reason !== 'missing-file');
    expect(anchors, formatViolations(anchors)).toEqual([]);
  });
});

describe('shipped rulebook link deliverability', () => {
  it('every rulebook link target is rooted in a tree that deploys under a harness home', async () => {
    const rejections = await findRulebookRejections();
    expect(rejections, rejections.join('\n')).toEqual([]);
  });
});

/**
 * Renders every shipped rulebook the way `sync` does, collecting the error from each that names an undeliverable link
 * target. The root allowlist is lexical and harness-invariant, so one harness context stands for all of them.
 */
async function findRulebookRejections(): Promise<ReadonlyArray<string>> {
  const rulebookFiles: Array<string> = [];
  await collectHostFiles(path.join(CONTENT_ROOT, RULEBOOK_ROOT), rulebookFiles);

  const rejections: Array<string> = [];
  for (const file of rulebookFiles) {
    const slug = path.basename(file, '.md');
    const { body } = parseRulebookFile(await readFile(file, 'utf8'), `${slug}.md`);
    try {
      renderRulebookBody(body, slug, { homeDir: '.claude', harnessId: 'claude' });
    } catch (error) {
      rejections.push(error instanceof Error ? error.message : String(error));
    }
  }
  return rejections;
}
