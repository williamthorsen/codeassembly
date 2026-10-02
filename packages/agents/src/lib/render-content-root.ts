import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { renderAmbientBody } from './ambient-body.ts';
import { hasAmbientRegion, injectAmbientRegion } from './ambient-region.ts';
import { ARTIFACT_TYPES, artifactFrontmatterPath, type ArtifactType } from './artifact-types.ts';
import type { ContentDefect } from './content-defects.ts';
import type { ContentRootRef } from './content-root-manifest.ts';
import { createSourceResolver, type SourceResolver } from './content-sources.ts';
import { type DirectArtifacts, type ResolvedClosure, resolveSeedClosures } from './dependency-resolver.ts';
import { listVisibleMarkdownFiles } from './fs-helpers.ts';
import { buildGuidanceHookFills } from './guidance-hook-fills.ts';
import type { GuidanceHookFills } from './guidance-hooks.ts';
import {
  listGuidanceTemplateFiles,
  renderGuidanceTemplateFile,
  resolveGuidanceTemplateDir,
} from './guidance-template.ts';
import { HARNESSES } from './harness.ts';
import { loadHarnessOverlay } from './harness-overlay.ts';
import type { RulebookInvocationCatalog } from './invocation-tokens.ts';
import { enumerateCatalogSlugs, listSupportEntries } from './library-catalog.ts';
import {
  createContentRootLinkAnchor,
  createSkillLinkAnchor,
  type LinkAnchorContext,
  SOURCE_SUPPORT_DIR,
} from './link-anchor.ts';
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

/**
 * Renders what `root` ships for one harness, resolving the root first. `bindings` maps each guidance hook to the
 * rulebook slugs bound to it, as a declaration's `guidance-hooks:` does; a bound rulebook seeds the closure, so a
 * binding to a rulebook that the root does not contain is a resolution defect.
 */
export async function renderContentRoot(
  root: string,
  harnessId: HarnessId,
  bindings?: ReadonlyMap<string, ReadonlyArray<string>>,
): Promise<ContentRootRender & { readonly defects: ReadonlyArray<ContentDefect> }> {
  const boundSlugs = bindings === undefined ? [] : bindings.values().toArray().flat();
  const resolved = await resolveContentRoot(root, { rulebook: boundSlugs });
  const render = await renderResolvedContentRoot(harnessId, root, resolved.artifacts, bindings);
  return { ...render, defects: resolved.defects };
}

/**
 * Renders the root's artifacts for one harness, as a consumer declaring all of them receives them, collecting every
 * rendered file and every failure. Each artifact's render is caught independently so that one broken artifact does
 * not hide the rest.
 *
 * Every file is placed as a home-domain `sync` places it, with the root declared as a source named after its
 * directory: Its support entries deploy into that source's namespace, and link targets anchor there.
 */
export async function renderResolvedContentRoot(
  harnessId: HarnessId,
  root: string,
  artifacts: ResolvedRootArtifacts,
  bindings?: ReadonlyMap<string, ReadonlyArray<string>>,
): Promise<ContentRootRender> {
  const config = HARNESSES[harnessId];
  const rootRef: ContentRootRef = { dir: root, name: path.basename(root) };
  const skillsDir = path.join(root, ARTIFACT_TYPES.skill.contentPath);
  const supportEntries = await listSupportEntries(skillsDir);
  const anchorContext: LinkAnchorContext = {
    deployedSkillDirs: new Set([
      ...artifacts.rulebooks.filter((book) => book.skill).map((book) => book.skillName),
      ...artifacts.skills.filter((skill) => skillTargetsHarness(skill, harnessId)).map((skill) => skill.slug),
    ]),
    domainBase: '~',
    homeDir: config.homeDir,
    skillsDirName: config.skillsDirName,
    supportEntries: new Set(supportEntries),
    supportNamespace: rootRef.name,
  };
  // One catalog for every render, so that a `{rulebook:<slug>}` token resolves here exactly as it will under `sync`.
  const rulebooks: RulebookInvocationCatalog = new Map(
    artifacts.rulebooks.map((book) => [book.slug, { skillName: book.skillName, skill: book.skill }]),
  );
  const rulebookContext: RulebookRenderContext = {
    anchor: createContentRootLinkAnchor(anchorContext),
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
    anchor: createSkillLinkAnchor(anchorContext),
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
    if (!skillTargetsHarness(skill, harnessId)) {
      continue;
    }
    await collect(artifactFrontmatterPath('skill', skill.slug), async () =>
      readRenderedEntries(`${config.skillsDirName}/${skill.slug}`, await renderDeployedSkill(skill, skillContext)),
    );
  }

  for (const subagent of artifacts.subagents) {
    await collect(artifactFrontmatterPath('subagent', subagent.slug), async () => [
      {
        path: `${config.subagentsDirName}/${subagent.slug}.md`,
        content: await renderDeployedSubagent(subagent, subagentContext),
      },
    ]);
  }

  const supportDir = `${config.skillsDirName}/${SOURCE_SUPPORT_DIR}/${rootRef.name}`;
  for (const name of supportEntries) {
    const relPath = `${ARTIFACT_TYPES.skill.contentPath}/${name}`;
    await collect(relPath, () =>
      renderSupportFiles(path.join(skillsDir, name), `${supportDir}/${name}`, root, skillContext),
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
 * Resolves the closure of everything `root` ships, plus `extraSeeds`, against the root alone. An edge to an artifact
 * that the root does not contain is a defect. Every seed and every artifact is resolved independently, so one defect
 * never hides the rest.
 */
export async function resolveContentRoot(root: string, extraSeeds: DirectArtifacts = {}): Promise<ResolvedContentRoot> {
  const resolver = createSourceResolver([{ name: path.basename(root), dir: root }]);
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
 * Renders one `skills/` support entry as `sync` delivers it: through the same `renderSupportEntry`, with anything that
 * is not Markdown read verbatim. `destPath` is where the entry deploys relative to the harness home.
 */
async function renderSupportFiles(
  srcPath: string,
  destPath: string,
  contentRoot: string,
  skillContext: SkillDeployContext,
): Promise<ReadonlyArray<RenderedFile>> {
  const rendered = await renderSupportEntry(srcPath, path.posix.basename(destPath), contentRoot, skillContext);
  if (rendered.kind === 'verbatim') {
    return [{ path: destPath, content: await readFile(srcPath, 'utf8') }];
  }
  if (rendered.kind === 'markdown') {
    return [{ path: destPath, content: rendered.content }];
  }
  return readRenderedEntries(destPath, rendered.entries);
}

/**
 * Resolves every artifact that the closure reached against the root, so a body that never parses is reported once
 * here rather than as a render failure per harness. Each resolution is caught independently.
 */
async function resolveArtifacts(
  closure: ResolvedClosure,
  resolver: SourceResolver,
): Promise<{ artifacts: ResolvedRootArtifacts; defects: ReadonlyArray<ContentDefect> }> {
  const defects: Array<ContentDefect> = [];
  const rulebooks: Array<ResolvedRulebook> = [];
  const skills: Array<ResolvedSkill> = [];
  const subagents: Array<ResolvedSubagent> = [];

  /** Records a resolution failure against the artifact that raised it. */
  function record(type: ArtifactType, slug: string, error: unknown): void {
    defects.push({ file: artifactFrontmatterPath(type, slug), kind: 'resolution', detail: describeError(error) });
  }

  for (const slug of closure.rulebooks) {
    try {
      rulebooks.push(await resolveRulebook(slug, resolver));
    } catch (error: unknown) {
      record('rulebook', slug, error);
    }
  }
  for (const slug of closure.skills) {
    try {
      skills.push(await resolveDeclaredSkill(slug, resolver));
    } catch (error: unknown) {
      record('skill', slug, error);
    }
  }
  for (const slug of closure.subagents) {
    try {
      subagents.push(await resolveDeclaredSubagent(slug, resolver));
    } catch (error: unknown) {
      record('subagent', slug, error);
    }
  }

  return { artifacts: { rulebooks, skills, subagents }, defects };
}

// endregion | Helpers
