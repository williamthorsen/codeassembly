import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { renderAmbientBody } from '../commands/sync/ambient-hosts.ts';
import { buildGuidanceHookFills } from '../commands/sync/hook-bindings.ts';
import { hasAmbientRegion, injectAmbientRegion } from './ambient-region.ts';
import { ARTIFACT_TYPES, artifactFrontmatterPath, type ArtifactType } from './artifact-types.ts';
import type { ContentDefect } from './content-defects.ts';
import type { ContentRootRef } from './content-root-manifest.ts';
import { createSourceResolver, type SourceResolver } from './content-sources.ts';
import { type DirectArtifacts, type ResolvedClosure, resolveSeedClosures } from './dependency-resolver.ts';
import { listVisibleMarkdownFiles } from './fs-helpers.ts';
import type { GuidanceHookFills } from './guidance-hooks.ts';
import {
  listGuidanceTemplateFiles,
  renderGuidanceTemplateFile,
  resolveGuidanceTemplateDir,
} from './guidance-template.ts';
import { HARNESSES, resolveSkillsPathPrefix } from './harness.ts';
import { loadHarnessOverlay } from './harness-overlay.ts';
import type { RulebookInvocationCatalog } from './invocation-tokens.ts';
import { enumerateCatalogSlugs, listSupportEntries } from './library-catalog.ts';
import { buildSourceReference, injectProvenanceMarker } from './marker-injector.ts';
import { homeAnchor } from './path-rewriter.ts';
import { type ResolvedRulebook, resolveRulebook } from './rulebook-deploy.ts';
import { renderSkillFile } from './rulebook-skill.ts';
import { renderRulebookBody, type RulebookRenderContext } from './rulebook-transform.ts';
import { renderDeployedSkill, resolveDeclaredSkill, type ResolvedSkill, skillTargetsHarness } from './skill-deploy.ts';
import { type RenderedSkillEntry, renderSupportEntry, type SkillDeployContext } from './skill-transform.ts';
import {
  renderDeployedSubagent,
  resolveDeclaredSubagent,
  type ResolvedSubagent,
  type SubagentDeployContext,
} from './subagent-deploy.ts';
import type { HarnessId } from './types.ts';

/** One rendered file, keyed by its POSIX path relative to the harness home, with its full text as deployed. */
export interface RenderedFile {
  readonly path: string;
  readonly content: string;
}

/** One file whose render failed: its path relative to the content root, and what it threw. */
export interface RenderFailure {
  readonly file: string;
  readonly error: unknown;
}

/** One harness's render of a content root: every file that rendered, and every file that failed. */
export interface ContentRootRender {
  readonly files: ReadonlyArray<RenderedFile>;
  readonly failures: ReadonlyArray<RenderFailure>;
}

/** Every artifact reached from a content root's seeds, resolved against its owning source. */
export interface ResolvedRootArtifacts {
  readonly rulebooks: ReadonlyArray<ResolvedRulebook>;
  readonly skills: ReadonlyArray<ResolvedSkill>;
  readonly subagents: ReadonlyArray<ResolvedSubagent>;
}

/** A content root resolved for rendering: its resolver, its artifacts, and every defect that resolution raised. */
export interface ResolvedContentRoot {
  readonly resolver: SourceResolver;
  readonly artifacts: ResolvedRootArtifacts;
  /** Dependency defects (an edge that dangles or cycles) followed by resolution defects (a body that never parses). */
  readonly defects: ReadonlyArray<ContentDefect>;
}

/**
 * Lists every artifact that a content root ships, per type, collections included. Collections are added explicitly:
 * `enumerateCatalogSlugs` drops them as traversal-only nodes, but a collection's hand-listed `members:` slug is a
 * dangling reference that a producer can ship, so it has to be walked from somewhere.
 */
export async function listContentRootCatalog(root: string): Promise<Record<ArtifactType, ReadonlyArray<string>>> {
  const catalog = await enumerateCatalogSlugs(root);
  const collectionDir = path.join(root, ARTIFACT_TYPES.collection.contentPath);
  const collection = (await listVisibleMarkdownFiles(collectionDir)).map((file) => path.basename(file, '.md'));
  return {
    rulebook: catalog.rulebook ?? [],
    skill: catalog.skill ?? [],
    subagent: catalog.subagent ?? [],
    collection,
  };
}

/** True when an artifact resolved from the content root rather than from the built-in library behind it. */
export function ownedByRoot(artifact: { readonly source: string | undefined }): boolean {
  return artifact.source !== undefined;
}

/**
 * Renders what `root` ships for one harness, resolving the root first. `bindings` maps each guidance hook to the
 * rulebook slugs bound to it, as a declaration's `guidance-hooks:` does; a bound rulebook seeds the closure, so one
 * from the library behind the root fills as it would under `sync`.
 */
export async function renderContentRoot(
  root: string,
  harnessId: HarnessId,
  libraryDir: string,
  bindings?: ReadonlyMap<string, ReadonlyArray<string>>,
): Promise<ContentRootRender & { readonly defects: ReadonlyArray<ContentDefect> }> {
  const boundSlugs = bindings === undefined ? [] : bindings.values().toArray().flat();
  const resolved = await resolveContentRoot(root, libraryDir, { rulebook: boundSlugs });
  const render = await renderResolvedContentRoot(harnessId, root, libraryDir, resolved.artifacts, bindings);
  return { ...render, defects: resolved.defects };
}

/**
 * Renders the root's own artifacts for one harness, as a consumer declaring all of them receives them, collecting
 * every rendered file and every failure. Each artifact's render is caught independently so that one broken artifact
 * does not hide the rest.
 *
 * Only artifacts that the root owns are rendered. The closure follows dependency edges into the built-in library so
 * that a producer's `dependencies:` resolves the way it will at a consumer, but a library artifact is context rather
 * than subject: Its content-root-relative path would name a file that the producer does not have, and a defect in it
 * is neither theirs to fix nor introduced by them.
 *
 * The deployed-rulebook catalog stays the whole reached set regardless, since a `{rulebook:<slug>}` token in the root's
 * own body may name a library rulebook and must resolve the way it will at a consumer.
 *
 * Link targets anchor at the harness home, where `install` deploys the library: Every file is placed as a home-domain
 * deploy places it.
 */
export async function renderResolvedContentRoot(
  harnessId: HarnessId,
  root: string,
  libraryDir: string,
  artifacts: ResolvedRootArtifacts,
  bindings?: ReadonlyMap<string, ReadonlyArray<string>>,
): Promise<ContentRootRender> {
  const config = HARNESSES[harnessId];
  const rootRef: ContentRootRef = {
    dir: root,
    name: path.resolve(root) === path.resolve(libraryDir) ? undefined : path.basename(root),
  };
  // One catalog for every render, so that a `{rulebook:<slug>}` token resolves here exactly as it will under `sync`.
  const rulebooks: RulebookInvocationCatalog = new Map(
    artifacts.rulebooks.map((book) => [book.slug, { skillName: book.skillName, skill: book.skill }]),
  );
  const rulebookContext: RulebookRenderContext = {
    anchor: homeAnchor(config.homeDir),
    guidanceFileName: config.guidanceFileName,
    homeDir: config.homeDir,
    harnessId: config.id,
    skillSigil: config.skillSigil,
    subagentSigil: config.subagentSigil,
    rulebooks,
  };
  const guidanceHookFills: GuidanceHookFills | undefined =
    bindings === undefined
      ? undefined
      : buildGuidanceHookFills(bindings, artifacts.rulebooks, harnessId, () => rulebookContext);
  const skillContext: SkillDeployContext = {
    ...rulebookContext,
    anchor: homeAnchor(resolveSkillsPathPrefix(config)),
    guidanceHookFills,
  };
  const subagentContext: SubagentDeployContext = {
    ...rulebookContext,
    // The root's own overlay, which a consumer's `sync` merges into a subagent resolved from this root.
    overlayYaml: await loadHarnessOverlay(root, config),
    guidanceHookFills,
  };

  const files: Array<RenderedFile> = [];
  const failures: Array<RenderFailure> = [];

  /** Renders one source file's outputs, recording a throw against that file. */
  async function collect(
    file: string,
    render: () => ReadonlyArray<RenderedFile> | Promise<ReadonlyArray<RenderedFile>>,
  ): Promise<boolean> {
    try {
      files.push(...(await render()));
      return true;
    } catch (error: unknown) {
      failures.push({ file, error });
      return false;
    }
  }

  const renderedAmbient: Array<ResolvedRulebook> = [];
  for (const rulebook of artifacts.rulebooks) {
    if (!ownedByRoot(rulebook)) {
      continue;
    }
    const didRender = await collect(artifactFrontmatterPath('rulebook', rulebook.slug), () => {
      const body = renderRulebookBody(rulebook.body, rulebook.slug, rulebookContext);
      if (!rulebook.skill) {
        return [];
      }
      const content = renderSkillFile({
        body,
        description: rulebook.description,
        skillName: rulebook.skillName,
        slug: rulebook.slug,
        version: rulebook.version,
      });
      return [{ path: `${config.skillsDirName}/${rulebook.skillName}/SKILL.md`, content }];
    });
    if (didRender && rulebook.ambient) {
      renderedAmbient.push(rulebook);
    }
  }

  for (const skill of artifacts.skills) {
    if (!ownedByRoot(skill) || !skillTargetsHarness(skill, harnessId)) {
      continue;
    }
    await collect(artifactFrontmatterPath('skill', skill.slug), async () =>
      readRenderedEntries(`${config.skillsDirName}/${skill.slug}`, await renderDeployedSkill(skill, skillContext)),
    );
  }

  for (const subagent of artifacts.subagents) {
    if (!ownedByRoot(subagent)) {
      continue;
    }
    await collect(artifactFrontmatterPath('subagent', subagent.slug), async () => [
      {
        path: `${config.subagentsDirName}/${subagent.slug}.md`,
        content: await renderDeployedSubagent(subagent, subagentContext),
      },
    ]);
  }

  const skillsDir = path.join(root, ARTIFACT_TYPES.skill.contentPath);
  const supportEntries = await listSupportEntries(skillsDir);
  for (const name of supportEntries) {
    const relPath = `${ARTIFACT_TYPES.skill.contentPath}/${name}`;
    await collect(relPath, () =>
      renderSupportFiles(path.join(skillsDir, name), `${config.skillsDirName}/${name}`, relPath, rootRef, skillContext),
    );
  }

  // A rulebook that failed its own render is left out of the region rather than raised again against this file.
  const ambientBody = renderAmbientBody(renderedAmbient, [], harnessId, () => rulebookContext);
  const templateFiles = await listGuidanceTemplateFiles(root, harnessId);
  for (const fileName of templateFiles) {
    await collect(`guidance/_harnesses/${harnessId}/${fileName}`, async () => {
      if (!fileName.endsWith('.md')) {
        const content = await readFile(path.join(resolveGuidanceTemplateDir(root, harnessId), fileName), 'utf8');
        return [{ path: fileName, content }];
      }
      const rendered = await renderGuidanceTemplateFile(rootRef, harnessId, fileName);
      const content =
        ambientBody !== '' && hasAmbientRegion(rendered) ? injectAmbientRegion(rendered, ambientBody) : rendered;
      return [{ path: fileName, content }];
    });
  }

  return { files, failures };
}

/**
 * Resolves the closure of everything `root` ships, plus `extraSeeds`, against the root with the library at
 * `libraryDir` behind it, which is the shape in which a consumer deploys it. Every seed and every artifact is resolved
 * independently, so one defect never hides the rest.
 *
 * Library artifacts are resolved but never reported on: They are reached so that the root's own artifacts see the
 * catalog that a consumer would, not because they are under examination. A failure in one means that the installed
 * library is damaged, which an edit to the root cannot repair.
 */
export async function resolveContentRoot(
  root: string,
  libraryDir: string,
  extraSeeds: DirectArtifacts = {},
): Promise<ResolvedContentRoot> {
  const resolver = createSourceResolver([{ name: root, dir: root }], libraryDir);
  const catalog = await listContentRootCatalog(root);
  const seeds: DirectArtifacts = {
    ...catalog,
    rulebook: [...new Set([...catalog.rulebook, ...(extraSeeds.rulebook ?? [])])],
  };
  const seeded = await resolveSeedClosures(seeds, resolver);
  const resolved = await resolveArtifacts(seeded.closure, resolver);
  return { resolver, artifacts: resolved.artifacts, defects: [...seeded.defects, ...resolved.defects] };
}

// region | Helpers

/** Reads a rendered skill tree into files under `prefix`, loading each asset's bytes from its source as text. */
async function readRenderedEntries(
  prefix: string,
  entries: ReadonlyArray<RenderedSkillEntry>,
): Promise<ReadonlyArray<RenderedFile>> {
  const files: Array<RenderedFile> = [];
  for (const entry of entries) {
    const content = entry.kind === 'markdown' ? entry.content : await readFile(entry.srcPath, 'utf8');
    files.push({ path: `${prefix}/${entry.relPath}`, content });
  }
  return files;
}

/**
 * Renders one `skills/` support entry as `install` writes it: through the same `renderSupportEntry`, with the
 * provenance marker stamped into every Markdown file and anything else read verbatim. `destPath` is where the entry
 * deploys relative to the harness home, and `relPath` is where it is found relative to the content root.
 */
async function renderSupportFiles(
  srcPath: string,
  destPath: string,
  relPath: string,
  rootRef: ContentRootRef,
  skillContext: SkillDeployContext,
): Promise<ReadonlyArray<RenderedFile>> {
  const rendered = await renderSupportEntry(srcPath, path.posix.basename(destPath), rootRef.dir, skillContext);
  if (rendered.kind === 'verbatim') {
    return [{ path: destPath, content: await readFile(srcPath, 'utf8') }];
  }
  if (rendered.kind === 'markdown') {
    return [
      { path: destPath, content: injectProvenanceMarker(rendered.content, buildSourceReference(rootRef, relPath)) },
    ];
  }
  return Promise.all(
    rendered.entries.map(async (entry) =>
      entry.kind === 'markdown'
        ? {
            path: `${destPath}/${entry.relPath}`,
            content: injectProvenanceMarker(
              entry.content,
              buildSourceReference(rootRef, `${relPath}/${entry.relPath}`),
            ),
          }
        : { path: `${destPath}/${entry.relPath}`, content: await readFile(entry.srcPath, 'utf8') },
    ),
  );
}

/**
 * Resolves every artifact that the closure reached against its owning source, so a body that never parses is reported
 * once here rather than as a render failure per harness. Each resolution is caught independently, and a failure in an
 * artifact owned by the library is not reported.
 */
async function resolveArtifacts(
  closure: ResolvedClosure,
  resolver: SourceResolver,
): Promise<{ artifacts: ResolvedRootArtifacts; defects: ReadonlyArray<ContentDefect> }> {
  const defects: Array<ContentDefect> = [];
  const rulebooks: Array<ResolvedRulebook> = [];
  const skills: Array<ResolvedSkill> = [];
  const subagents: Array<ResolvedSubagent> = [];

  /** Records a resolution failure against the artifact that raised it, ignoring one owned by the library. */
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

  return { artifacts: { rulebooks, skills, subagents }, defects };
}

// endregion | Helpers
