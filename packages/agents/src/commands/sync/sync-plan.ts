import type { ArtifactType } from '../../lib/artifact-types.ts';
import type { DeclaredSource } from '../../lib/declared-sources.ts';
import type { ResolvedRulebook } from '../../lib/rulebook-deploy.ts';
import type { ResolvedSkill } from '../../lib/skill-deploy.ts';
import type { ResolvedSubagent } from '../../lib/subagent-deploy.ts';
import type { ResolvedHarnessTargets } from '../../lib/target-harnesses.ts';
import type { PlannedAmbientHost } from './ambient-hosts.ts';
import type { DroppedHarnessRetraction } from './harness-retraction.ts';
import type { GuidanceHookAdvisory } from './hook-bindings.ts';
import type { Retirement } from './legacy-retirement.ts';
import type { HarnessSkillTarget, HarnessSubagentTarget } from './render-contexts.ts';
import type { SourceSupportPlan } from './source-support.ts';

/** A scope carrying no `codeassembly.yaml` to act on, and the tier whose remedy the report names. */
export interface MissingDeclaration {
  readonly kind: 'no-declaration';
  readonly declarationPath: string;
  readonly scope: 'global' | 'project';
}

/**
 * One deployed artifact's resolution outcome: its type and slug, the source it resolved from (`undefined` = library),
 * and whether it masks a same-slug library artifact. Drives both the dry-run resolution report and the real-run shadow
 * warning.
 */
export interface ResolutionEntry {
  readonly type: ArtifactType;
  readonly slug: string;
  readonly source: string | undefined;
  readonly shadowsLibrary: boolean;
}

/** What a sync resolved and what it did, or what it would have done under `--dry-run`. */
export type SyncOutcome = MissingDeclaration | { readonly kind: 'reconciled'; readonly plan: SyncPlan };

/**
 * Everything a sync resolved, and every write, retraction, and warning it produced. Both reports render from this one
 * plan, so a condition either can describe reaches the other in the same terms. The closing summary's counts are
 * derived from these same fields rather than carried alongside them, which is what keeps a count and the enumeration
 * it summarizes from disagreeing.
 */
export interface SyncPlan {
  readonly targets: ResolvedHarnessTargets;
  /** What each harness dropped by the declaration still holds from a previous sync, one entry per harness with any. */
  readonly droppedHarnesses: ReadonlyArray<DroppedHarnessRetraction>;
  readonly resolutionReport: ReadonlyArray<ResolutionEntry>;
  readonly ambientHosts: ReadonlyArray<PlannedAmbientHost>;
  /** Hosts the run writes that git does not ignore, so machine-local guidance does not become a commit candidate. */
  readonly unignoredHosts: ReadonlyArray<string>;
  readonly retirements: ReadonlyArray<Retirement>;
  readonly resolved: ReadonlyArray<ResolvedRulebook>;
  readonly harnessSkillTargets: ReadonlyArray<HarnessSkillTarget>;
  readonly skillOrphansByDir: ReadonlyArray<{ skillsDir: string; orphans: ReadonlyArray<string> }>;
  readonly resolvedSkills: ReadonlyArray<ResolvedSkill>;
  readonly declaredSkillOrphansByDir: ReadonlyArray<{ skillsDir: string; orphans: ReadonlyArray<string> }>;
  readonly resolvedSubagents: ReadonlyArray<ResolvedSubagent>;
  readonly harnessSubagentTargets: ReadonlyArray<HarnessSubagentTarget>;
  readonly subagentOrphansByDir: ReadonlyArray<{ subagentsDir: string; orphans: ReadonlyArray<string> }>;
  /** One entry per source that would deliver support content, naming its namespace dir and how many files land there. */
  readonly sourceSupportPlans: ReadonlyArray<SourceSupportPlan>;
  /** Namespace paths under each target's support root that no declared source claims. */
  readonly sourceSupportRetractions: ReadonlyArray<string>;
  readonly promptsYmlPaths: ReadonlyArray<string>;
  /** Declared sources whose directory does not exist, and so contribute nothing to resolution. */
  readonly missingSources: ReadonlyArray<DeclaredSource>;
  /** Dependencies shipping guidance the project has not declared. */
  readonly undeclaredPackages: ReadonlyArray<string>;
  /** Disagreements between the declaration's guidance-hook bindings and what those bindings reach. */
  readonly guidanceHookAdvisories: ReadonlyArray<GuidanceHookAdvisory>;
}
