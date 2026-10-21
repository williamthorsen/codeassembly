import { ARTIFACT_TYPE_VALUES, type ArtifactType } from '../../lib/artifact-types.ts';
import type { ResolvedDeclaration } from '../../lib/codeassembly-manifest.ts';
import { createSourceResolver, type SourceResolver } from '../../lib/content-sources.ts';
import { type DeclaredSource, resolveDeclaredSources } from '../../lib/declared-sources.ts';
import { type DirectArtifacts, resolveSeedClosures } from '../../lib/dependency-resolver.ts';
import { enumerateCatalogSlugs } from '../../lib/library-catalog.ts';
import { type ResolvedRulebook, resolveRulebook } from '../../lib/rulebook-deploy.ts';
import { resolveDeclaredSkill, type ResolvedSkill } from '../../lib/skill-deploy.ts';
import { resolveDeclaredSubagent, type ResolvedSubagent } from '../../lib/subagent-deploy.ts';
import {
  type DefectCollector,
  dropUnresolvableSeeds,
  findBoundRulebookHookDefects,
  findSkillNameCollisionDefects,
  findUnresolvableBindingDefects,
  findUnresolvableDeclaredArtifactDefects,
  resolveEachArtifact,
  type UnresolvableSlugs,
} from './pre-write-gates.ts';
import type { SyncDomain } from './sync-domain.ts';

/** What closure resolution settles: the declared sources and the rulebooks, skills, and subagents resolved from them. */
interface ResolvedDomainArtifacts {
  readonly missingSources: ReadonlyArray<DeclaredSource>;
  readonly resolved: ReadonlyArray<ResolvedRulebook>;
  readonly resolvedSkills: ReadonlyArray<ResolvedSkill>;
  readonly resolvedSubagents: ReadonlyArray<ResolvedSubagent>;
  readonly resolver: SourceResolver;
  readonly sources: ReadonlyArray<DeclaredSource>;
}

/**
 * Resolves the declaration's sources, expands its seeds into their transitive closure, and resolves each artifact of
 * the closure against the sources, adding every defect that it finds to `defects` rather than throwing.
 */
export async function resolveDomainArtifacts(
  declaration: ResolvedDeclaration,
  domain: SyncDomain,
  defects: DefectCollector,
): Promise<ResolvedDomainArtifacts> {
  // Resolution searches the declared sources alone, highest precedence first. Every declared source is validated up
  // front, so a non-directory or unreadable one, or a declaration without a usable source, fails the whole run
  // (dry-run included) before any write.
  const { sources, missingSources } = await resolveDeclaredSources({
    baseDir: domain.baseDir,
    declaration,
  });
  const resolver = createSourceResolver(sources);

  // Everything a package under `packages:` provides seeds the closure, which makes naming the package the whole
  // declaration; a package named by a `sources:` entry seeds nothing. A package whose content dir is missing
  // enumerates nothing: The walk reads through a directory listing that doesn't
  // return any entries for an absent directory.
  const packageCatalogs = await Promise.all(
    sources.filter((source) => source.declaredAs === 'package').map((source) => enumerateCatalogSlugs(source.dir)),
  );

  // Checked before the closure resolves so that a typo names the hook that bound it or the file that declared it;
  // seeding alone would report only that some artifact went missing.
  const bound = await findUnresolvableBindingDefects(declaration.guidanceHooks, resolver);
  defects.add(bound.defects);
  const declared = await findUnresolvableDeclaredArtifactDefects(
    declaration,
    domain.ambient === 'harness-home' ? 'home' : 'project',
    resolver,
  );
  defects.add(declared.defects);
  // A binding seeds the closure, so a bound rulebook that does not resolve from any source belongs in the declared
  // set skipped by the walk.
  const unresolvable: UnresolvableSlugs = {
    ...declared.unresolvable,
    rulebook: new Set([...declared.unresolvable.rulebook, ...bound.unresolvable]),
  };

  // Expand declared collections (and any artifact's own dependencies) into the deployable per-type sets before
  // resolving against the sources, so that a declared collection deploys exactly its transitive closure.
  // Because the walk runs one seed at a time, a bad edge is attributed to the artifact that owns it and every
  // remaining seed still resolves. A seed already reported as unresolvable is dropped, so that it is not reported
  // twice.
  const seeded = await resolveSeedClosures(
    dropUnresolvableSeeds(
      mergeSeeds([
        {
          rulebook: declaration.rulebooks,
          skill: declaration.skills,
          subagent: declaration.subagents,
          collection: declaration.collections,
        },
        // A binding is a dependency edge: A bound rulebook deploys per its own `delivery:` without being declared twice.
        { rulebook: [...new Set(declaration.guidanceHooks.values().toArray().flat())] },
        ...packageCatalogs,
      ]),
      unresolvable,
    ),
    resolver,
  );
  defects.add(seeded.defects);
  const closure = seeded.closure;
  const declaredRulebooks = closure.rulebooks;

  // Resolve and validate every declared rulebook, skill, and subagent before writing anything, so that a missing
  // source file, invalid frontmatter, or a still-`install` artifact is reported rather than leaving a partial sync.
  // Each pass resolves what it can: An artifact reported here is simply absent from the passes below.
  const rulebookResolution = await resolveEachArtifact('rulebook', declaredRulebooks, (slug) =>
    resolveRulebook(slug, resolver),
  );
  const resolved = rulebookResolution.resolved;
  defects.add(rulebookResolution.defects);
  defects.add(findSkillNameCollisionDefects(resolved));
  defects.add(findBoundRulebookHookDefects(declaration.guidanceHooks, resolved));
  const skillResolution = await resolveEachArtifact('skill', closure.skills, (slug) =>
    resolveDeclaredSkill(slug, resolver),
  );
  const resolvedSkills = skillResolution.resolved;
  defects.add(skillResolution.defects);
  const subagentResolution = await resolveEachArtifact('subagent', closure.subagents, (slug) =>
    resolveDeclaredSubagent(slug, resolver),
  );
  const resolvedSubagents = subagentResolution.resolved;
  defects.add(subagentResolution.defects);

  return { missingSources, resolved, resolvedSkills, resolvedSubagents, resolver, sources };
}

// region | Helpers

/**
 * Concatenates per-type seed sets into the one set that seeds closure resolution, leaving duplicates in: `resolveClosure`
 * dedupes by slug as it walks.
 */
function mergeSeeds(sets: ReadonlyArray<DirectArtifacts>): DirectArtifacts {
  const merged: Record<ArtifactType, Array<string>> = { rulebook: [], skill: [], subagent: [], collection: [] };
  for (const set of sets) {
    for (const type of ARTIFACT_TYPE_VALUES) {
      merged[type].push(...(set[type] ?? []));
    }
  }
  return merged;
}

// endregion | Helpers
