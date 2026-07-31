import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { makeArtifactMarker } from './artifact-marker.ts';
import { artifactFrontmatterPath } from './artifact-types.ts';
import { describeSearchedLocations, type SourceResolver } from './content-sources.ts';
import { expandIncludes } from './directive-expander.ts';
import { writeIfChanged } from './fs-helpers.ts';
import { renderSubagentForHarness } from './subagent-transform.ts';

/**
 * A declared subagent resolved through the source resolver: its stable slug, the source `.md` file to render from, the
 * content root its includes resolve against — the library for a library subagent, the declaring source for a source
 * subagent — and the source it resolved from (the declaring source's name, or `undefined` for the built-in library).
 */
export interface ResolvedSubagent {
  readonly slug: string;
  readonly srcPath: string;
  readonly contentRoot: string;
  readonly source: string | undefined;
}

/** The per-harness inputs a declared-subagent deploy depends on, resolved once per harness by `sync`. */
export interface SubagentDeployContext {
  /** Raw harness overlay YAML feeding the frontmatter merge. */
  readonly overlayYaml: string;
  /** Canonical → harness tool-name mapping for the body-text placeholder rewriter. */
  readonly toolMapping: ReadonlyMap<string, string>;
  /** Harness-relative prefix for `~/`-prefixed Markdown link targets, and the `{harness_home_dir}` expansion target. */
  readonly homeDir: string;
  /** Harness identifier that `{harness_id}` tokens expand to. */
  readonly harnessId: string;
  /** Sigil prefixed to a rendered `{skill:<slug>}` invocation token (e.g. `/` for Claude). */
  readonly skillSigil: string;
  /** Sigil prefixed to a rendered `{subagent:<slug>}` invocation token (empty on both current harnesses). */
  readonly subagentSigil: string;
}

const subagentMarker = makeArtifactMarker('subagent');

/**
 * Materializes a resolved subagent to `destPath`, applying the harness transform (frontmatter merge, tool-name rewrite,
 * path/template rewrite) and stamping the `codeassembly-subagent:<slug>` ownership marker. No provenance marker is
 * injected — declared subagents carry only the ownership marker, which is what `sync` retracts against. The write is
 * byte-stable, so re-deploying unchanged content makes no filesystem change.
 */
export async function deploySubagent(
  resolved: ResolvedSubagent,
  destPath: string,
  context: SubagentDeployContext,
): Promise<void> {
  const rendered = await renderSubagent(resolved, context);
  await mkdir(path.dirname(destPath), { recursive: true });
  await writeIfChanged(destPath, subagentMarker.injectMarker(rendered, resolved.slug));
}

/**
 * Renders a resolved subagent for one harness: include expansion, then the harness transform. Throws on a broken
 * include, an unmapped `{tool:NAME}` placeholder, or a `{rulebook:<slug>}` token, which no subagent body may carry.
 * The pre-write render gate and `deploySubagent` share this one path, so the gate raises exactly what the write would.
 */
export async function renderSubagent(resolved: ResolvedSubagent, context: SubagentDeployContext): Promise<string> {
  const expanded = await expandIncludes(resolved.srcPath, resolved.contentRoot);
  const fileName = `${resolved.slug}.md`;
  return renderSubagentForHarness(expanded, {
    overlayYaml: context.overlayYaml,
    toolMapping: context.toolMapping,
    fileRelPath: fileName,
    sourceLabel: `subagents/${fileName}`,
    pathPrefix: context.homeDir,
    homeDir: context.homeDir,
    harnessId: context.harnessId,
    skillSigil: context.skillSigil,
    subagentSigil: context.subagentSigil,
  });
}

/**
 * Resolves a declared subagent slug through the source resolver (declared sources first, then the library), confirming
 * its `<slug>.md` exists and carrying the resolved content root — the source or library directory it resolved from — so
 * the deploy pass expands its includes against its own tree. A slug found in no source or the library throws an error
 * naming every location searched.
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
