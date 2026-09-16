import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { parse as parseYaml } from 'yaml';

import { ARTIFACT_TYPES, artifactFrontmatterPath, type ArtifactType } from './artifact-types.ts';
import { type ContentDefect, foldHarnessDefects, type HarnessDefect } from './content-defects.ts';
import { resolveContentDir } from './content-resolver.ts';
import {
  CONTENT_MANIFEST_FILENAME,
  type ContentFormatProblem,
  describeSupportedFormats,
  findContentFormatProblem,
  OPTIONAL_TOKEN_CONTENT_FORMAT,
  readContentRootManifest,
} from './content-root-manifest.ts';
import { createSourceResolver, type SourceResolver } from './content-sources.ts';
import { type DirectArtifacts, type ResolvedClosure, resolveSeedClosures } from './dependency-resolver.ts';
import { findCrossNamespaceCollisions, findSkillNameCollisions } from './deploy-collisions.ts';
import { parseFrontmatter } from './frontmatter-merger.ts';
import { listMarkdownFilesRecursively, listVisibleMarkdownFiles } from './fs-helpers.ts';
import { HARNESSES, resolveSkillsPathPrefix } from './harness.ts';
import { loadHarnessOverlay } from './harness-overlay.ts';
import { locateInvocationTokens, type RulebookInvocationCatalog } from './invocation-tokens.ts';
import { enumerateCatalogSlugs, listSupportEntries } from './library-catalog.ts';
import { homeAnchor } from './path-rewriter.ts';
import { type ResolvedRulebook, resolveRulebook } from './rulebook-deploy.ts';
import { renderRulebookBody, type RulebookRenderContext } from './rulebook-transform.ts';
import {
  resolveDeclaredSkill,
  type ResolvedSkill,
  skillTargetsHarness,
  SUPPORTED_HARNESSES_KEY,
} from './skill-deploy.ts';
import { renderSkillDirectory, renderSupportEntry, type SkillDeployContext } from './skill-transform.ts';
import { findSourceProblem } from './source-validation.ts';
import {
  renderSubagent,
  resolveDeclaredSubagent,
  type ResolvedSubagent,
  type SubagentDeployContext,
} from './subagent-deploy.ts';
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
 * Reports every body that uses a form that the root's declared content format predates. The optional invocation-token
 * form needs format 2, so a root containing one under a lower format deploys its literal text on a tool implementing
 * only that contract, which is the outcome that the format field exists to prevent. The walk reads files rather than
 * resolved bodies: A partial carries a token into every body that inlines it, and a partial resolves only within its
 * own root.
 */
export async function findUnderdeclaredFormatDefects(root: string): Promise<ReadonlyArray<ContentDefect>> {
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

/**
 * Validates everything `root` ships that reaches a consumer, returning every defect found rather than stopping at the
 * first. Runs the checks that a consumer's `sync` runs before writing (dependency closure, artifact resolution,
 * delivery collisions, and a per-harness render) over a whole content root instead of over one consumer's declared
 * closure, plus one pass for which `sync` has no counterpart: the retired frontmatter key, which reaches a consumer
 * intact rather than failing there.
 *
 * Nothing here reads a `codeassembly.yaml`. The root is resolved as if it were a declared source with the built-in
 * library behind it, which is the shape in which a consumer deploys it, so a producing package with no consuming
 * project anywhere on its path validates exactly as it will be consumed. A dependency edge into a library artifact
 * therefore resolves rather than dangling.
 *
 * Every stage after the root check runs to completion, and a defect in one artifact never suppresses the rest: One run
 * reports the whole list that an author has to fix. Only the root's own artifacts are reported on; see
 * `renderForHarness`.
 *
 * `libraryDir` overrides the library against which the root resolves, matching `sync`'s own override.
 */
export async function validateContentRoot(
  root: string,
  harnessIds: ReadonlyArray<HarnessId>,
  libraryDir: string = resolveContentDir(),
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

  const resolver = createSourceResolver([{ name: root, dir: root }], libraryDir);
  const seeded = await resolveSeedClosures(await collectSeeds(root), resolver);
  const artifacts = await resolveArtifacts(seeded.closure, resolver);

  // A body-local defect raises the same message on every harness, so the fold below collapses it to one line; a
  // harness-specific one (a skill scoped to one harness) surfaces naming the harnesses that it affects.
  const rendered: Array<HarnessDefect> = [];
  for (const harnessId of harnessIds) {
    rendered.push(...(await renderForHarness(harnessId, root, artifacts)));
  }

  return [
    ...seeded.defects,
    ...artifacts.defects,
    ...(await findUnderdeclaredFormatDefects(root)),
    ...findCollisionDefects(artifacts),
    ...(await findRetiredKeyDefects(artifacts)),
    ...(await findRetiredOverlayKeyDefects(root, harnessIds)),
    ...foldHarnessDefects(rendered, harnessIds),
  ];
}

// region | Helpers

/** Every artifact reached from a content root's seeds, resolved against its owning source. */
interface ResolvedArtifacts {
  readonly rulebooks: ReadonlyArray<ResolvedRulebook>;
  readonly skills: ReadonlyArray<ResolvedSkill>;
  readonly subagents: ReadonlyArray<ResolvedSubagent>;
  readonly defects: ReadonlyArray<ContentDefect>;
}

/**
 * Enumerates every artifact that the root ships as a closure seed. Adds collections to the per-type catalog
 * explicitly: `enumerateCatalogSlugs` drops them as traversal-only nodes, but a collection's hand-listed `members:`
 * slug is a dangling reference that a producer can ship, so it has to be walked from somewhere.
 */
async function collectSeeds(root: string): Promise<DirectArtifacts> {
  const catalog = await enumerateCatalogSlugs(root);
  const collectionDir = path.join(root, ARTIFACT_TYPES.collection.contentPath);
  const collection = (await listVisibleMarkdownFiles(collectionDir)).map((file) => path.basename(file, '.md'));
  return { ...catalog, collection };
}

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
function findCollisionDefects(artifacts: ResolvedArtifacts): ReadonlyArray<ContentDefect> {
  const defects: Array<ContentDefect> = [];
  const ownedRulebooks = artifacts.rulebooks.filter(ownedByRoot);
  const ownedSkillSlugs = new Set(artifacts.skills.filter(ownedByRoot).map((skill) => skill.slug));

  for (const { skillName, slugs } of findSkillNameCollisions(artifacts.rulebooks)) {
    // Attributed to a rulebook owned by the root. A collision entirely between library rulebooks is the library's to
    // fix and names no file that the root contains, so it is left to the library's own gate.
    const owned = slugs.find((slug) => ownedRulebooks.some((book) => book.slug === slug));
    if (owned !== undefined) {
      defects.push({
        file: artifactFrontmatterPath('rulebook', owned),
        kind: 'collision',
        detail: `Rulebooks ${slugs.join(', ')} all resolve to skill "${skillName}"; give all but one a distinct \`skill-name\`.`,
      });
    }
  }

  const rulebookSkillDirs = artifacts.rulebooks.filter((book) => book.skill).map((book) => book.skillName);
  const declaredSkillSlugs = new Set(artifacts.skills.map((skill) => skill.slug));
  for (const name of findCrossNamespaceCollisions(rulebookSkillDirs, declaredSkillSlugs)) {
    // The report is attributed to whichever side the root owns, since that is the side that its author can rename.
    const ownedRulebook = ownedRulebooks.find((book) => book.skill && book.skillName === name);
    const file = ownedSkillSlugs.has(name)
      ? artifactFrontmatterPath('skill', name)
      : ownedRulebook && artifactFrontmatterPath('rulebook', ownedRulebook.slug);
    if (file !== undefined) {
      defects.push({
        file,
        kind: 'collision',
        detail: `"${name}" is delivered as both a rulebook skill and a declared skill; rename one so that they no longer share a directory.`,
      });
    }
  }

  return defects;
}

/**
 * Reports every root-owned skill whose frontmatter still declares the retired harness-narrowing key. The rename is
 * silent at deploy time in both directions (the skill stops narrowing and reaches every harness, and the key survives
 * into the deployed `SKILL.md` because the strip pattern no longer matches it), so this pass reports it.
 *
 * Being harness-independent, it runs once over the resolved artifacts rather than inside the per-harness render.
 */
async function findRetiredKeyDefects(artifacts: ResolvedArtifacts): Promise<ReadonlyArray<ContentDefect>> {
  const defects: Array<ContentDefect> = [];
  for (const skill of artifacts.skills) {
    if (!ownedByRoot(skill)) {
      continue;
    }
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

/** True when an artifact resolved from the content root rather than from the built-in library behind it. */
function ownedByRoot(artifact: { readonly source: string | undefined }): boolean {
  return artifact.source !== undefined;
}

/**
 * Renders the root's own artifacts for one harness, discarding the output. Each render is caught independently so that
 * one broken artifact does not hide the rest.
 *
 * Only artifacts that the root owns are rendered. The closure follows dependency edges into the built-in library so
 * that a producer's `dependencies:` resolves the way it will at a consumer, but a library artifact is context rather
 * than subject: Its content-root-relative path would name a file that the producer does not have, and a defect in it
 * is neither theirs to fix nor introduced by them. The one library failure that is theirs (naming an artifact that
 * resolves from nowhere) is a dependency defect, reported against the artifact of theirs that declared the edge.
 *
 * The deployed-rulebook catalog stays the whole reached set regardless, since a `{rulebook:<slug>}` token in the root's
 * own body may name a library rulebook and must resolve the way it will at a consumer.
 */
async function renderForHarness(
  harnessId: HarnessId,
  root: string,
  artifacts: ResolvedArtifacts,
): Promise<ReadonlyArray<HarnessDefect>> {
  const config = HARNESSES[harnessId];
  // The root's own overlay, which a consumer's `sync` merges into a subagent resolved from this root.
  const overlayYaml = await loadHarnessOverlay(root, config);
  // One catalog for all three renders, so that a `{rulebook:<slug>}` token resolves here exactly as it will under
  // `sync`.
  const rulebooks: RulebookInvocationCatalog = new Map(
    artifacts.rulebooks.map((book) => [book.slug, { skillName: book.skillName, skill: book.skill }]),
  );
  const skillContext: SkillDeployContext = {
    anchor: homeAnchor(resolveSkillsPathPrefix(config)),
    guidanceFileName: config.guidanceFileName,
    homeDir: config.homeDir,
    harnessId: config.id,
    skillSigil: config.skillSigil,
    subagentSigil: config.subagentSigil,
    rulebooks,
  };
  const subagentContext: SubagentDeployContext = {
    overlayYaml,
    anchor: homeAnchor(config.homeDir),
    guidanceFileName: config.guidanceFileName,
    homeDir: config.homeDir,
    harnessId: config.id,
    skillSigil: config.skillSigil,
    subagentSigil: config.subagentSigil,
    rulebooks,
  };
  const rulebookContext: RulebookRenderContext = {
    anchor: homeAnchor(config.homeDir),
    guidanceFileName: config.guidanceFileName,
    homeDir: config.homeDir,
    harnessId: config.id,
    skillSigil: config.skillSigil,
    subagentSigil: config.subagentSigil,
    rulebooks,
  };

  const raised: Array<HarnessDefect> = [];
  function record(file: string, error: unknown): void {
    raised.push({ harnessId, defect: { file, kind: 'render', detail: describeError(error) } });
  }

  for (const rulebook of artifacts.rulebooks) {
    if (!ownedByRoot(rulebook)) {
      continue;
    }
    try {
      renderRulebookBody(rulebook.body, rulebook.slug, rulebookContext);
    } catch (error: unknown) {
      record(artifactFrontmatterPath('rulebook', rulebook.slug), error);
    }
  }

  for (const skill of artifacts.skills) {
    if (!ownedByRoot(skill) || !skillTargetsHarness(skill, harnessId)) {
      continue;
    }
    try {
      await renderSkillDirectory(skill.srcDir, skill.slug, skill.contentRoot, skillContext);
    } catch (error: unknown) {
      record(artifactFrontmatterPath('skill', skill.slug), error);
    }
  }

  for (const subagent of artifacts.subagents) {
    if (!ownedByRoot(subagent)) {
      continue;
    }
    try {
      await renderSubagent(subagent, subagentContext);
    } catch (error: unknown) {
      record(artifactFrontmatterPath('subagent', subagent.slug), error);
    }
  }

  raised.push(...(await renderSupportEntries(harnessId, root, skillContext)));
  return raised;
}

/**
 * Renders the support entries under `skills/` and discards the output, through the same `renderSupportEntry` the
 * installer runs. Sharing the render makes a defect here one that would really ship, and keeps a shape that the
 * installer copies without complaint from failing this gate.
 */
async function renderSupportEntries(
  harnessId: HarnessId,
  root: string,
  skillContext: SkillDeployContext,
): Promise<ReadonlyArray<HarnessDefect>> {
  const skillsDir = path.join(root, ARTIFACT_TYPES.skill.contentPath);
  const raised: Array<HarnessDefect> = [];

  const supportEntries = await listSupportEntries(skillsDir);
  for (const name of supportEntries) {
    const relPath = `${ARTIFACT_TYPES.skill.contentPath}/${name}`;
    try {
      await renderSupportEntry(path.join(skillsDir, name), name, root, skillContext);
    } catch (error: unknown) {
      raised.push({ harnessId, defect: { file: relPath, kind: 'render', detail: describeError(error) } });
    }
  }

  return raised;
}

/**
 * Resolves every artifact that the closure reached against its owning source, so a body that never parses is reported
 * once here rather than as a render failure per harness. Each resolution is caught independently.
 *
 * Library artifacts are resolved but never reported on, for the reason `renderForHarness` gives: They are reached so
 * that the root's own artifacts see the catalog that a consumer would, not because they are under examination. A
 * failure here means the installed library is damaged, which no edit to the root can repair.
 */
async function resolveArtifacts(closure: ResolvedClosure, resolver: SourceResolver): Promise<ResolvedArtifacts> {
  const defects: Array<ContentDefect> = [];
  const rulebooks: Array<ResolvedRulebook> = [];
  const skills: Array<ResolvedSkill> = [];
  const subagents: Array<ResolvedSubagent> = [];

  async function record(type: ArtifactType, slug: string, error: unknown): Promise<void> {
    if ((await resolver.resolve(type, slug))?.source === undefined) {
      return;
    }
    defects.push({ file: artifactFrontmatterPath(type, slug), kind: 'resolution', detail: describeError(error) });
  }

  for (const slug of closure.rulebooks) {
    try {
      rulebooks.push(await resolveRulebook(slug, resolver));
    } catch (error: unknown) {
      await record('rulebook', slug, error);
    }
  }
  for (const slug of closure.skills) {
    try {
      skills.push(await resolveDeclaredSkill(slug, resolver));
    } catch (error: unknown) {
      await record('skill', slug, error);
    }
  }
  for (const slug of closure.subagents) {
    try {
      subagents.push(await resolveDeclaredSubagent(slug, resolver));
    } catch (error: unknown) {
      await record('subagent', slug, error);
    }
  }

  return { rulebooks, skills, subagents, defects };
}

// endregion | Helpers
