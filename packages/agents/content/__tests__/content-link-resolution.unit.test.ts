import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors/candidate';
import { beforeAll, describe, expect, it } from 'vitest';

import { collectHeadingSlugs, findUnterminatedFence, normalizeForAnchorScan } from '../../src/lib/anchor-resolution.ts';
import { expandIncludes } from '../../src/lib/directive-expander.ts';
import { isTestDirectory } from '../../src/lib/fs-helpers.ts';
import type { RulebookInvocationCatalog } from '../../src/lib/invocation-tokens.ts';
import { homeAnchor, isRewritableLinkTarget, MARKDOWN_LINK_REGEX } from '../../src/lib/path-rewriter.ts';
import { parseRulebookFile } from '../../src/lib/rulebook-schema.ts';
import { resolveSkillName } from '../../src/lib/rulebook-skill.ts';
import { renderRulebookBody } from '../../src/lib/rulebook-transform.ts';

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
// A host that leaves a code fence open is reported before either check runs. Everything below such a fence is read as
// code, so the links and headings the host appears to carry are not the ones it carries, and a clean result over it
// would be indistinguishable from a checked one. The render gate throws on the same condition.
//
// The render pass rejects a same-body anchor on its own, over content from any source. This suite still covers it,
// because it reports every violation across the tree at once where the render pass throws on the first artifact, and
// because a fragment on a cross-file target is checked nowhere else: the deployed tree unions library content with
// each declared source's, so the render pass cannot resolve one from the content root at hand. Both share one slug
// algorithm through `anchor-resolution`.
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

const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

type Reason = 'ambiguous-anchor' | 'dead-anchor' | 'missing-file' | 'unterminated-fence';

interface Violation {
  readonly file: string;
  readonly target: string;
  readonly reason: Reason;
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
    const anchors = violations.filter((v) => v.reason === 'ambiguous-anchor' || v.reason === 'dead-anchor');
    expect(anchors, formatViolations(anchors)).toEqual([]);
  });

  it('no installable host leaves a code fence open, which would hide every anchor below it', () => {
    const fences = violations.filter((v) => v.reason === 'unterminated-fence');
    expect(fences, formatFenceViolations(fences)).toEqual([]);
  });
});

describe('shipped rulebook reference deliverability', () => {
  it('every rulebook link target and invocation token names something that deploys', async () => {
    const rejections = await findRulebookRejections();
    expect(rejections, rejections.join('\n')).toEqual([]);
  });
});

/**
 * Renders every shipped rulebook the way `sync` does, collecting the error from each that names an undeliverable link
 * target or an unusable `{rulebook:<slug>}` token. Every shipped rulebook stands in for the deployed set, which is the
 * strictest catalog available here: a token naming one that is missing or ambient-only has nothing to invoke under any
 * declaration. The root allowlist and the catalog are both harness-invariant, so one harness context stands for all.
 */
async function findRulebookRejections(): Promise<ReadonlyArray<string>> {
  const rulebookFiles: Array<string> = [];
  await collectHostFiles(path.join(CONTENT_ROOT, RULEBOOK_ROOT), rulebookFiles);

  const parsed = await Promise.all(
    rulebookFiles.map(async (file) => {
      const slug = path.basename(file, '.md');
      const { rulebook, body } = parseRulebookFile(await readFile(file, 'utf8'), `${slug}.md`);
      return {
        slug,
        body,
        skillName: resolveSkillName(slug, rulebook['skill-name']),
        skill: rulebook.delivery.includes('skill'),
      };
    }),
  );
  const rulebooks: RulebookInvocationCatalog = new Map(
    parsed.map(({ slug, skillName, skill }) => [slug, { skillName, skill }]),
  );

  const rejections: Array<string> = [];
  for (const { slug, body } of parsed) {
    try {
      renderRulebookBody(body, slug, {
        anchor: homeAnchor('.claude'),
        homeDir: '.claude',
        harnessId: 'claude',
        skillSigil: '/',
        subagentSigil: '',
        rulebooks,
      });
    } catch (error) {
      rejections.push(describeError(error));
    }
  }
  return rejections;
}

// region | Helpers

/** Recursively collects installable host `.md` files, skipping `_partials/` at any depth and dotfiles. */
async function collectHostFiles(dir: string, out: Array<string>): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '_partials' || entry.name.startsWith('.') || isTestDirectory(entry.name)) {
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
    const expanded = await expandIncludes(hostFile, CONTENT_ROOT);
    const file = path.relative(CONTENT_ROOT, hostFile);

    // Everything below an open fence is blanked, so the anchors and links this host appears to carry are not the ones
    // it carries. Reporting the fence and moving on matches the order the render gate uses for the same reason.
    const unterminated = findUnterminatedFence(expanded);
    if (unterminated !== undefined) {
      violations.push({ file, target: unterminated, reason: 'unterminated-fence' });
      continue;
    }

    const body = normalizeForAnchorScan(expanded);

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

/** Renders the unterminated-fence violations, whose subject is a fence rather than a link target. */
function formatFenceViolations(violations: ReadonlyArray<Violation>): string {
  if (violations.length === 0) {
    return '';
  }
  const header =
    `Found ${violations.length} unterminated code fence(s). Everything below an open fence reads as code, so no ` +
    `anchor there is checked and a clean result over it carries no information. A closing fence repeats the opening ` +
    `character at least as many times.`;
  const lines = violations.map((v) => `  [${v.reason}] ${v.file}: opened with ${v.target}`);
  return [header, ...lines].join('\n');
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
  const slugs = collectHeadingSlugs(normalizeForAnchorScan(await expandIncludes(file, CONTENT_ROOT)));
  cache.set(file, slugs);
  return slugs;
}

// endregion | Helpers
