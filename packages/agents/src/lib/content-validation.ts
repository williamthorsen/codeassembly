import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { parse as parseYaml } from 'yaml';

import { artifactFrontmatterPath } from './artifact-types.ts';
import { type ContentDefect, foldHarnessDefects, type HarnessDefect } from './content-defects.ts';
import {
  CONTENT_MANIFEST_FILENAME,
  type ContentFormatProblem,
  describeSupportedFormats,
  findContentFormatProblem,
  OPTIONAL_TOKEN_CONTENT_FORMAT,
  readContentRootManifest,
} from './content-root-manifest.ts';
import { findInjectionPlacementDefects } from './content-rules/injection-placement.ts';
import { findLinkResolutionDefects } from './content-rules/link-resolution.ts';
import { findNonBreakingSpaceDefects } from './content-rules/non-breaking-space.ts';
import type { RuleContext } from './content-rules/rule-context.ts';
import { findScriptInvocationDefects } from './content-rules/script-invocation.ts';
import { findSharedGuidanceLinkDefects } from './content-rules/shared-guidance-links.ts';
import { findSharedGuidanceReferenceDefects } from './content-rules/shared-guidance-references.ts';
import { findSupportEntryTokenDefects } from './content-rules/support-entry-tokens.ts';
import { findCrossNamespaceCollisions, findSkillNameCollisions } from './deploy-collisions.ts';
import { parseFrontmatter } from './frontmatter-merger.ts';
import { listMarkdownFilesRecursively } from './fs-helpers.ts';
import { HARNESSES, SUPPORTED_HARNESSES_KEY } from './harness.ts';
import { loadHarnessOverlay } from './harness-overlay.ts';
import { locateInvocationTokens } from './invocation-tokens.ts';
import { renderResolvedContentRoot, resolveContentRoot, type ResolvedRootArtifacts } from './render-content-root.ts';
import { findSourceProblem } from './source-validation.ts';
import { isRecord } from './type-guards.ts';
import type { HarnessId } from './types.ts';

export type { ContentDefect, ContentDefectKind } from './content-defects.ts';

/**
 * The frontmatter key that `supported-harnesses:` replaced. Nothing reads it any more, so a skill left declaring it
 * deploys to every harness and carries the key into deployed output. Neither of those raises anything on its own,
 * which is why this pass reports it.
 */
const RETIRED_HARNESSES_KEY = 'harnesses';

/**
 * The overlay key that the tool's own harness table replaced. An overlay still declaring it deploys unchanged, since
 * the frontmatter merge looks up by agent name and never reads it, so this pass tells a producer that it is dead.
 */
const RETIRED_TOOLS_KEY = '_tools';

/**
 * Validates everything `root` ships that reaches a consumer, returning every defect found rather than stopping at the
 * first. Runs the checks that a consumer's `sync` runs before writing (dependency closure, artifact resolution,
 * delivery collisions, and a per-harness render) over a whole content root instead of over one consumer's declared
 * closure, plus the passes for which `sync` does not have a counterpart: the retired frontmatter key, which reaches a
 * consumer intact rather than failing there, and the content rules, each a convention that holds for any root.
 *
 * Nothing here reads a `codeassembly.yaml`. The root is resolved alone, as a declared source with nothing behind it,
 * so a producing package without a consuming project anywhere on its path validates the same way on every machine. A
 * dependency edge to an artifact that the root does not contain is a defect.
 *
 * Every stage after the root check runs to completion, and a defect in one artifact never suppresses the rest: One run
 * reports the whole list that an author has to fix.
 */
export async function validateContentRoot(
  root: string,
  harnessIds: ReadonlyArray<HarnessId>,
): Promise<ReadonlyArray<ContentDefect>> {
  const problem = await findSourceProblem(root);
  if (problem !== undefined) {
    return [{ file: '.', kind: 'root', detail: `Content root is unusable: ${problem.detail}.` }];
  }

  // A root whose declared format this tool cannot honor is not then checked under the rules of the format that it
  // does support, which would report defects against a contract never claimed by the root.
  const formatProblem = await findContentFormatProblem(root);
  if (formatProblem !== undefined) {
    return [{ file: '.', kind: 'root', detail: describeContentFormatDefect(formatProblem) }];
  }

  const { artifacts, defects, resolver } = await resolveContentRoot(root);
  const context: RuleContext = { root, resolver };

  // A body-local defect raises the same message on every harness, so the fold below collapses it to one line; a
  // harness-specific one (a skill scoped to one harness) surfaces naming the harnesses that it affects.
  const rendered: Array<HarnessDefect> = [];
  for (const harnessId of harnessIds) {
    const { failures } = await renderResolvedContentRoot(harnessId, root, artifacts);
    for (const { file, error } of failures) {
      rendered.push({ harnessId, defect: { file, kind: 'render', detail: describeError(error) } });
    }
  }

  return [
    ...defects,
    ...(await findUnderdeclaredFormatDefects(root)),
    ...findCollisionDefects(artifacts),
    ...(await findRetiredKeyDefects(artifacts)),
    ...(await findRetiredOverlayKeyDefects(root, harnessIds)),
    ...foldHarnessDefects(rendered, harnessIds),
    ...(await findInjectionPlacementDefects(context)),
    ...(await findLinkResolutionDefects(context)),
    ...(await findNonBreakingSpaceDefects(context)),
    ...(await findScriptInvocationDefects(context)),
    ...(await findSharedGuidanceLinkDefects(context)),
    ...(await findSharedGuidanceReferenceDefects(context)),
    ...(await findSupportEntryTokenDefects(context)),
  ];
}

// region | Helpers

/** True when a skill's frontmatter still declares the retired harness-narrowing key, whatever value it holds. */
function declaresRetiredHarnessesKey(content: string): boolean {
  const { lines } = parseFrontmatter(content);
  const parsed: unknown = parseYaml(lines.join('\n'));
  return isRecord(parsed) && parsed[RETIRED_HARNESSES_KEY] !== undefined;
}

/**
 * Renders a content-format problem as the defect detail that a producer reads. The detail for an unsupported format
 * names the supported set, which is the half that says what to do about it; a malformed manifest already names the
 * file and the fault.
 */
function describeContentFormatDefect(problem: ContentFormatProblem): string {
  if (problem.kind === 'malformed') {
    return `Content manifest is unreadable: ${problem.detail}.`;
  }
  return `Content root ${problem.detail}; this codeassembly supports ${describeSupportedFormats()}.`;
}

/**
 * Reports the two delivery collisions that only a whole root can see: two skill-delivery rulebooks resolving to one
 * skill name, and a name claimed by both the rulebook-skill and declared-skill namespaces. Each is attributed to one
 * of the colliding files and names all of them, since neither side is the offender on its own.
 */
function findCollisionDefects(artifacts: ResolvedRootArtifacts): ReadonlyArray<ContentDefect> {
  const defects: Array<ContentDefect> = [];

  for (const { skillName, slugs } of findSkillNameCollisions(artifacts.rulebooks)) {
    const [first] = slugs;
    if (first !== undefined) {
      defects.push({
        file: artifactFrontmatterPath('rulebook', first),
        kind: 'collision',
        detail: `Rulebooks ${slugs.join(', ')} all resolve to skill "${skillName}"; give all but one a distinct \`skill-name\`.`,
      });
    }
  }

  const rulebookSkillDirs = artifacts.rulebooks.filter((book) => book.skill).map((book) => book.skillName);
  const declaredSkillSlugs = new Set(artifacts.skills.map((skill) => skill.slug));
  for (const name of findCrossNamespaceCollisions(rulebookSkillDirs, declaredSkillSlugs)) {
    defects.push({
      file: artifactFrontmatterPath('skill', name),
      kind: 'collision',
      detail: `"${name}" is delivered as both a rulebook skill and a declared skill; rename one so that they no longer share a directory.`,
    });
  }

  return defects;
}

/**
 * Reports every skill whose frontmatter still declares the retired harness-narrowing key. The rename is
 * silent at deploy time in both directions (the skill stops narrowing and reaches every harness, and the key survives
 * into the deployed `SKILL.md` because the strip pattern no longer matches it), so this pass reports it.
 *
 * Being harness-independent, it runs once over the resolved artifacts rather than inside the per-harness render.
 */
async function findRetiredKeyDefects(artifacts: ResolvedRootArtifacts): Promise<ReadonlyArray<ContentDefect>> {
  const defects: Array<ContentDefect> = [];
  for (const skill of artifacts.skills) {
    const file = artifactFrontmatterPath('skill', skill.slug);
    try {
      if (declaresRetiredHarnessesKey(await readFile(path.join(skill.srcDir, 'SKILL.md'), 'utf8'))) {
        defects.push({
          file,
          kind: 'frontmatter',
          detail: `Frontmatter declares the retired \`${RETIRED_HARNESSES_KEY}:\` key, which no longer narrows deployment; rename it to \`${SUPPORTED_HARNESSES_KEY}:\`.`,
        });
      }
    } catch (error: unknown) {
      defects.push({ file, kind: 'frontmatter', detail: describeError(error) });
    }
  }
  return defects;
}

/**
 * Reports every overlay shipped by the root that still declares the retired `_tools:` mapping, one defect per harness
 * whose overlay declares it. Read from the root's own tree rather than through the resolver, because an overlay is a
 * file that a content root ships rather than an artifact to which a slug resolves. An overlay this cannot parse is
 * reported as its own defect, since `validate` returns a report rather than throwing.
 */
async function findRetiredOverlayKeyDefects(
  root: string,
  harnessIds: ReadonlyArray<HarnessId>,
): Promise<ReadonlyArray<ContentDefect>> {
  const defects: Array<ContentDefect> = [];
  for (const harnessId of harnessIds) {
    const config = HARNESSES[harnessId];
    const overlayYaml = await loadHarnessOverlay(root, config);
    if (overlayYaml.trim() === '') {
      continue;
    }
    const file = path.join('subagents', '_data', config.frontmatterFile);
    try {
      const parsed: unknown = parseYaml(overlayYaml);
      if (isRecord(parsed) && parsed[RETIRED_TOOLS_KEY] !== undefined) {
        defects.push({
          file,
          kind: 'frontmatter',
          detail: `Overlay declares the retired \`${RETIRED_TOOLS_KEY}:\` mapping, which nothing reads; each harness's tool names now come from codeassembly itself. Remove the key.`,
        });
      }
    } catch (error: unknown) {
      defects.push({ file, kind: 'frontmatter', detail: describeError(error) });
    }
  }
  return defects;
}

/**
 * Reports every body that uses a form that the root's declared content format predates. The optional invocation-token
 * form needs format 2, so a root containing one under a lower format deploys its literal text on a tool implementing
 * only that contract, which is the outcome that the format field exists to prevent. The walk reads files rather than
 * resolved bodies: A partial carries a token into every body that inlines it, and a partial resolves only within its
 * own root.
 */
async function findUnderdeclaredFormatDefects(root: string): Promise<ReadonlyArray<ContentDefect>> {
  const { format } = await readContentRootManifest(root);
  if (format >= OPTIONAL_TOKEN_CONTENT_FORMAT) {
    return [];
  }

  const defects: Array<ContentDefect> = [];
  const files = await listMarkdownFilesRecursively(root);
  for (const file of files) {
    const carried = locateInvocationTokens(await readFile(file, 'utf8')).filter((token) => token.optional);
    if (carried.length === 0) {
      continue;
    }
    const named = carried.map((token) => `{${token.kind}?:${token.slug}}`).join(', ');
    defects.push({
      file: path.relative(root, file),
      kind: 'root',
      detail:
        `Contains an optional invocation token (${named}) under declared content format ${format}. ` +
        `Declare format ${OPTIONAL_TOKEN_CONTENT_FORMAT} in ${CONTENT_MANIFEST_FILENAME}, or write the token in its ` +
        'required form.',
    });
  }
  return defects;
}

// endregion | Helpers
