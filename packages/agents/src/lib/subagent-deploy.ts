import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { makeArtifactMarker } from './artifact-marker.ts';
import { expandIncludes } from './directive-expander.ts';
import { writeIfChanged } from './fs-helpers.ts';
import { renderSubagentForHarness } from './subagent-transform.ts';
import { isEnoent } from './type-guards.ts';

/** A declared subagent resolved against the library: its stable slug and the source `.md` file to render from. */
export interface ResolvedSubagent {
  readonly slug: string;
  readonly srcPath: string;
}

/** The per-harness inputs a declared-subagent deploy depends on, resolved once per harness by `sync`. */
export interface SubagentDeployContext {
  /** Library content root, used to resolve include directives during expansion. */
  readonly contentDir: string;
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
  const expanded = await expandIncludes(resolved.srcPath, context.contentDir);
  const fileName = `${resolved.slug}.md`;
  const rendered = renderSubagentForHarness(expanded, {
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
  await mkdir(path.dirname(destPath), { recursive: true });
  await writeIfChanged(destPath, subagentMarker.injectMarker(rendered, resolved.slug));
}

/**
 * Resolves a declared subagent slug against the library, confirming its `<slug>.md` exists. A missing file throws a
 * clear error naming the slug.
 */
export async function resolveDeclaredSubagent(slug: string, librarySubagentsDir: string): Promise<ResolvedSubagent> {
  const srcPath = path.join(librarySubagentsDir, `${slug}.md`);
  try {
    await readFile(srcPath, 'utf8');
  } catch (error: unknown) {
    if (isEnoent(error)) {
      throw new Error(`Declared subagent "${slug}" was not found in the library at ${srcPath}`);
    }
    throw error;
  }

  return { slug, srcPath };
}
