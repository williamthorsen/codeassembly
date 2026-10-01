import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { makeArtifactMarker } from './artifact-marker.ts';
import { artifactFrontmatterPath } from './artifact-types.ts';
import { describeSearchedLocations, type SourceResolver } from './content-sources.ts';
import { expandIncludes } from './directive-expander.ts';
import { writeIfChanged } from './fs-helpers.ts';
import type { GuidanceHookFills } from './guidance-hooks.ts';
import type { RulebookInvocationCatalog } from './invocation-tokens.ts';
import type { ResolveLinkAnchor, TemplateVariables } from './path-rewriter.ts';
import { renderSubagentForHarness } from './subagent-transform.ts';

/**
 * A declared subagent resolved through the source resolver: its stable slug, the source `.md` file to render from,
 * the content root against which its includes resolve (the declaring source's directory), and the declaring source's
 * name.
 */
export interface ResolvedSubagent {
  readonly slug: string;
  readonly srcPath: string;
  readonly contentRoot: string;
  readonly source: string;
}

/** The per-harness inputs on which a declared-subagent deploy depends, resolved once per harness by `sync`. */
export interface SubagentDeployContext extends TemplateVariables {
  /** Raw harness overlay YAML feeding the frontmatter merge. */
  readonly overlayYaml: string;
  /** Maps a resolved Markdown link target, relative to the content root, to the path at which it deploys. */
  readonly anchor: ResolveLinkAnchor;
  /** Sigil prefixed to a rendered `{skill:<slug>}` invocation token (e.g. `/` for Claude). */
  readonly skillSigil: string;
  /** Sigil prefixed to a rendered `{subagent:<slug>}` invocation token (empty on both current harnesses). */
  readonly subagentSigil: string;
  /** The deployed rulebooks that a `{rulebook:<slug>}` token may address, keyed by slug. */
  readonly rulebooks: RulebookInvocationCatalog;
  /**
   * Guidance bound to each hook that the subagent's body may declare; absent under `install`, which doesn't
   * resolve a binding.
   */
  readonly guidanceHookFills?: GuidanceHookFills | undefined;
}

const subagentMarker = makeArtifactMarker('subagent');

/**
 * Materializes a resolved subagent to `destPath`, applying the harness transform (frontmatter merge, tool-name rewrite,
 * path/template rewrite) and stamping the `codeassembly-subagent:<slug>` ownership marker. Doesn't inject a provenance
 * marker: Declared subagents have only the ownership marker, which `sync` retracts against. The write is byte-stable,
 * so re-deploying unchanged content doesn't change the filesystem.
 */
export async function deploySubagent(
  resolved: ResolvedSubagent,
  destPath: string,
  context: SubagentDeployContext,
): Promise<void> {
  const rendered = await renderDeployedSubagent(resolved, context);
  await mkdir(path.dirname(destPath), { recursive: true });
  await writeIfChanged(destPath, rendered);
}

/** Renders a resolved subagent for one harness as `deploySubagent` writes it, ownership marker included. */
export async function renderDeployedSubagent(
  resolved: ResolvedSubagent,
  context: SubagentDeployContext,
): Promise<string> {
  return subagentMarker.injectMarker(await renderSubagent(resolved, context), resolved.slug);
}

/**
 * Renders a resolved subagent for one harness: include expansion, then the harness transform. Throws on a broken
 * include, an unmapped `{tool:NAME}` placeholder, a `{rulebook:<slug>}` token naming an unknown or ambient-only
 * rulebook, or a guidance hook whose fill cannot be honored.
 * Because the pre-write render gate and `deploySubagent` share this one path, the gate raises exactly what the write
 * would.
 */
export async function renderSubagent(resolved: ResolvedSubagent, context: SubagentDeployContext): Promise<string> {
  const expanded = await expandIncludes(resolved.srcPath, resolved.contentRoot);
  const fileName = `${resolved.slug}.md`;
  return renderSubagentForHarness(expanded, {
    overlayYaml: context.overlayYaml,
    fileRelPath: fileName,
    sourceLabel: `subagents/${fileName}`,
    anchor: context.anchor,
    guidanceFileName: context.guidanceFileName,
    homeDir: context.homeDir,
    harnessId: context.harnessId,
    skillSigil: context.skillSigil,
    subagentSigil: context.subagentSigil,
    rulebooks: context.rulebooks,
    guidanceHookFills: context.guidanceHookFills,
  });
}

/**
 * Resolves a declared subagent slug through the source resolver, confirming its `<slug>.md` exists and returning the
 * resolved content root (the source directory from which it resolved) so that the deploy pass expands its includes
 * against its own tree. Throws an error naming every location searched when the slug is not found in any source.
 */
export async function resolveDeclaredSubagent(slug: string, resolver: SourceResolver): Promise<ResolvedSubagent> {
  const resolved = await resolver.resolve('subagent', slug);
  if (resolved === undefined) {
    throw new Error(
      `Declared subagent "${slug}" was not found in any of: ${describeSearchedLocations(resolver, 'subagent', slug)}`,
    );
  }

  return {
    slug,
    srcPath: path.join(resolved.dir, artifactFrontmatterPath('subagent', slug)),
    contentRoot: resolved.dir,
    source: resolved.source,
  };
}
