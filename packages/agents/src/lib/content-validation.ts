import path from 'node:path';

import { ARTIFACT_TYPE_VALUES, ARTIFACT_TYPES, artifactFrontmatterPath, type ArtifactType } from './artifact-types.ts';
import { resolveContentDir } from './content-resolver.ts';
import { createSourceResolver, type SourceResolver } from './content-sources.ts';
import { type DirectArtifacts, resolveClosure, type ResolvedClosure } from './dependency-resolver.ts';
import { findCrossNamespaceCollisions, findSkillNameCollisions } from './deploy-collisions.ts';
import { listVisibleMarkdownFiles } from './fs-helpers.ts';
import { HARNESSES, resolveSkillsPathPrefix } from './harness.ts';
import { loadHarnessOverlay } from './harness-overlay.ts';
import { enumerateCatalogSlugs, listSupportEntries } from './library-catalog.ts';
import { homeAnchor } from './path-rewriter.ts';
import { type ResolvedRulebook, resolveRulebook } from './rulebook-deploy.ts';
import { renderRulebookBody, type RulebookRenderContext } from './rulebook-transform.ts';
import { resolveDeclaredSkill, type ResolvedSkill, skillTargetsHarness } from './skill-deploy.ts';
import { renderSkillDirectory, renderSupportEntry, type SkillDeployContext } from './skill-transform.ts';
import { describeSourceProblem } from './source-validation.ts';
import {
  renderSubagent,
  resolveDeclaredSubagent,
  type ResolvedSubagent,
  type SubagentDeployContext,
} from './subagent-deploy.ts';
import { loadToolMapping } from './tool-name-rewriter.ts';
import type { HarnessId } from './types.ts';

/** Which stage rejected an artifact, so a report can group by cause rather than presenting one undifferentiated list. */
export type ContentDefectKind = 'collision' | 'dependency' | 'render' | 'resolution' | 'root';

/** One rejected artifact: where it lives relative to the content root, which stage rejected it, and why. */
export interface ContentDefect {
  readonly file: string;
  readonly kind: ContentDefectKind;
  readonly detail: string;
}

/**
 * Validates everything `root` ships that reaches a consumer, returning every defect found rather than stopping at the
 * first. Runs the checks a consumer's `sync` runs before writing — dependency closure, artifact resolution, delivery
 * collisions, and a per-harness render — over a whole content root instead of over one consumer's declared closure.
 *
 * Nothing here reads a `codeassembly.yaml`. The root is resolved as if it were a declared source with the built-in
 * library behind it, which is the shape a consumer deploys it in, so a producing package with no consuming project
 * anywhere on its path validates exactly as it will be consumed. A dependency edge into a library artifact therefore
 * resolves rather than dangling.
 *
 * Every stage after the root check runs to completion, and a defect in one artifact never suppresses the rest: one run
 * reports the whole list an author has to fix. Only the root's own artifacts are reported on; see `renderForHarness`.
 *
 * `libraryDir` overrides the library the root resolves against, matching `sync`'s own override.
 */
export async function validateContentRoot(
  root: string,
  harnessIds: ReadonlyArray<HarnessId>,
  libraryDir: string = resolveContentDir(),
): Promise<ReadonlyArray<ContentDefect>> {
  const problem = await describeSourceProblem(root);
  if (problem !== undefined) {
    return [{ file: '.', kind: 'root', detail: `Content root is unusable: ${problem}.` }];
  }

  const resolver = createSourceResolver([{ name: root, dir: root }], libraryDir);
  const seeded = await resolveSeedClosures(await collectSeeds(root), resolver);
  const artifacts = await resolveArtifacts(seeded.closure, resolver);

  // A body-local defect raises the same message on every harness, so the fold below collapses it to one line; a
  // harness-specific one (a skill scoped to one harness) surfaces naming the harnesses it affects.
  const rendered: Array<HarnessDefect> = [];
  for (const harnessId of harnessIds) {
    rendered.push(...(await renderForHarness(harnessId, root, libraryDir, artifacts)));
  }

  return [
    ...seeded.defects,
    ...artifacts.defects,
    ...findCollisionDefects(artifacts),
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

/** A render defect paired with the harness whose render raised it, before harness-invariant ones are collapsed. */
interface HarnessDefect {
  readonly harnessId: HarnessId;
  readonly defect: ContentDefect;
}

/**
 * Enumerates every artifact the root ships as a closure seed. Collections join the per-type catalog explicitly:
 * `enumerateCatalogSlugs` drops them as traversal-only nodes, but a collection's hand-listed `members:` slug is a
 * dangling reference a producer can ship, so it has to be walked from somewhere.
 */
async function collectSeeds(root: string): Promise<DirectArtifacts> {
  const catalog = await enumerateCatalogSlugs(root);
  const collectionDir = path.join(root, ARTIFACT_TYPES.collection.contentPath);
  const collection = (await listVisibleMarkdownFiles(collectionDir)).map((file) => path.basename(file, '.md'));
  return { ...catalog, collection };
}

/** Renders an unknown thrown value as the message a report line carries. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    // Attributed to a rulebook the root owns. A collision entirely between library rulebooks is the library's to fix
    // and names no file the root carries, so it is left to the library's own gate.
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
    // Whichever side the root owns carries the report, since that is the side its author can rename.
    const ownedRulebook = ownedRulebooks.find((book) => book.skill && book.skillName === name);
    const file = ownedSkillSlugs.has(name)
      ? artifactFrontmatterPath('skill', name)
      : ownedRulebook && artifactFrontmatterPath('rulebook', ownedRulebook.slug);
    if (file !== undefined) {
      defects.push({
        file,
        kind: 'collision',
        detail: `"${name}" is delivered as both a rulebook skill and a declared skill; rename one so they no longer share a directory.`,
      });
    }
  }

  return defects;
}

/**
 * Collapses per-harness render defects into one list. A defect every validated harness raised is emitted once, since
 * it is a property of the source rather than of any harness; one raised by a subset keeps the harnesses in its detail,
 * because that subset is the finding.
 */
function foldHarnessDefects(
  raised: ReadonlyArray<HarnessDefect>,
  harnessIds: ReadonlyArray<HarnessId>,
): ReadonlyArray<ContentDefect> {
  const byDefect = new Map<string, { defect: ContentDefect; harnesses: Array<HarnessId> }>();
  for (const { harnessId, defect } of raised) {
    const key = JSON.stringify([defect.file, defect.kind, defect.detail]);
    const entry = byDefect.get(key);
    if (entry === undefined) {
      byDefect.set(key, { defect, harnesses: [harnessId] });
    } else if (!entry.harnesses.includes(harnessId)) {
      entry.harnesses.push(harnessId);
    }
  }

  return Array.from(byDefect.values(), ({ defect, harnesses }) =>
    harnesses.length === harnessIds.length
      ? defect
      : { ...defect, detail: `${defect.detail} (${harnesses.join(', ')})` },
  );
}

/** True when an artifact resolved from the content root rather than from the built-in library behind it. */
function ownedByRoot(artifact: { readonly source: string | undefined }): boolean {
  return artifact.source !== undefined;
}

/**
 * Renders the root's own artifacts for one harness, discarding the output. Each render is caught independently so one
 * broken artifact does not hide the rest.
 *
 * Only artifacts the root owns are rendered. The closure follows dependency edges into the built-in library so a
 * producer's `dependencies:` resolves the way it will at a consumer, but a library artifact is context rather than
 * subject: its content-root-relative path would name a file the producer does not have, and a defect in it is neither
 * theirs to fix nor introduced by them. The one library failure that is theirs — naming an artifact that resolves from
 * nowhere — is a dependency defect, reported against the artifact of theirs that declared the edge.
 *
 * The deployed-rulebook catalog stays the whole reached set regardless, since a `{rulebook:<slug>}` token in the root's
 * own body may name a library rulebook and must resolve the way it will at a consumer.
 */
async function renderForHarness(
  harnessId: HarnessId,
  root: string,
  libraryDir: string,
  artifacts: ResolvedArtifacts,
): Promise<ReadonlyArray<HarnessDefect>> {
  const config = HARNESSES[harnessId];
  // The overlay comes from the library, never from the root under validation: `{tool:NAME}` names are library-defined,
  // and this is the mapping a consumer's deploy would apply to the root's content.
  const overlayYaml = await loadHarnessOverlay(libraryDir, config);
  const toolMapping = loadToolMapping(overlayYaml);
  const skillContext: SkillDeployContext = {
    toolMapping,
    anchor: homeAnchor(resolveSkillsPathPrefix(config)),
    homeDir: config.homeDir,
    harnessId: config.id,
    skillSigil: config.skillSigil,
    subagentSigil: config.subagentSigil,
  };
  const subagentContext: SubagentDeployContext = {
    overlayYaml,
    toolMapping,
    anchor: homeAnchor(config.homeDir),
    homeDir: config.homeDir,
    harnessId: config.id,
    skillSigil: config.skillSigil,
    subagentSigil: config.subagentSigil,
  };
  const rulebookContext: RulebookRenderContext = {
    anchor: homeAnchor(config.homeDir),
    homeDir: config.homeDir,
    harnessId: config.id,
    skillSigil: config.skillSigil,
    subagentSigil: config.subagentSigil,
    rulebooks: new Map(
      artifacts.rulebooks.map((book) => [book.slug, { skillName: book.skillName, skill: book.skill }]),
    ),
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
 * installer runs. Sharing the render is what makes a defect here one that would really ship, and keeps a shape the
 * installer copies without complaint from failing this gate.
 */
async function renderSupportEntries(
  harnessId: HarnessId,
  root: string,
  skillContext: SkillDeployContext,
): Promise<ReadonlyArray<HarnessDefect>> {
  const skillsDir = path.join(root, ARTIFACT_TYPES.skill.contentPath);
  const raised: Array<HarnessDefect> = [];

  for (const name of await listSupportEntries(skillsDir)) {
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
 * Resolves every artifact the closure reached against its owning source, so a body that never parses is reported once
 * here rather than as a render failure per harness. Each resolution is caught independently.
 *
 * Library artifacts are resolved but never reported on, for the reason `renderForHarness` gives: they are reached so
 * the root's own artifacts see the catalog a consumer would, not because they are under examination. A failure here
 * means the installed library is damaged, which no edit to the root can repair.
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

/**
 * Walks the dependency closure one seed at a time and unions what each reaches. `resolveClosure` throws on the first
 * bad edge, so seeding it with the whole catalog would report one defect and abandon every artifact behind it; per-seed
 * makes each failure attributable to the artifact that owns the edge and lets the remaining seeds resolve.
 */
async function resolveSeedClosures(
  seeds: DirectArtifacts,
  resolver: SourceResolver,
): Promise<{ closure: ResolvedClosure; defects: ReadonlyArray<ContentDefect> }> {
  const defects: Array<ContentDefect> = [];
  const reached = { rulebook: new Set<string>(), skill: new Set<string>(), subagent: new Set<string>() };

  for (const type of ARTIFACT_TYPE_VALUES) {
    for (const slug of seeds[type] ?? []) {
      const seed: DirectArtifacts = { [type]: [slug] };
      try {
        const closure = await resolveClosure(seed, resolver);
        for (const reachedSlug of closure.rulebooks) {
          reached.rulebook.add(reachedSlug);
        }
        for (const reachedSlug of closure.skills) {
          reached.skill.add(reachedSlug);
        }
        for (const reachedSlug of closure.subagents) {
          reached.subagent.add(reachedSlug);
        }
      } catch (error: unknown) {
        defects.push({
          file: artifactFrontmatterPath(type, slug),
          kind: 'dependency',
          detail: describeError(error),
        });
      }
    }
  }

  return {
    closure: {
      rulebooks: Array.from(reached.rulebook).toSorted(),
      skills: Array.from(reached.skill).toSorted(),
      subagents: Array.from(reached.subagent).toSorted(),
    },
    defects,
  };
}

// endregion | Helpers
