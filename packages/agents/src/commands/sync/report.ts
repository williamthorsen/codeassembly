import path from 'node:path';

import {
  type DocumentChange,
  GROWTH_CEILING_BYTES,
  type GrowthWarning,
  type SizeReport,
} from '../../deployed-sizes/build-size-report.ts';
import { formatBytes, formatDelta } from '../../deployed-sizes/format-bytes.ts';
import { renderAggregates } from '../../deployed-sizes/render-aggregates.ts';
import type { ArtifactType } from '../../lib/artifact-types.ts';
import { describeMissingSource } from '../../lib/declared-sources.ts';
import type { ReportLine } from '../../lib/report-line.ts';
import { skillTargetsHarness } from '../../lib/skill-deploy.ts';
import { describeHarnessTargeting } from '../../lib/target-harnesses.ts';
import type { AmbientHostPlan, AmbientSkipReason } from './ambient-hosts.ts';
import type { DroppedHarnessRetraction, HostRetraction } from './harness-retraction.ts';
import type { GuidanceHookAdvisory } from './hook-bindings.ts';
import type { Retirement } from './legacy-retirement.ts';
import type { SizeReportOutcome } from './record-deployed-sizes.ts';
import type { SourceSupportPlan } from './source-support.ts';
import type { MissingDeclaration, ResolutionEntry, SyncOutcome, SyncPlan } from './sync-plan.ts';

/** Rank used to group resolution entries by type before the within-type slug sort. */
const ARTIFACT_TYPE_ORDER: Readonly<Record<ArtifactType, number>> = {
  rulebook: 0,
  skill: 1,
  subagent: 2,
  collection: 3,
};

/** The verbs that a retraction line takes, so that the same renderer serves a preview and the run that it previews. */
interface RetractionVerbs {
  readonly remove: string;
  readonly strip: string;
}

const PERFORMED_VERBS: RetractionVerbs = { remove: 'removed', strip: 'stripped' };
const PLANNED_VERBS: RetractionVerbs = { remove: 'remove', strip: 'strip' };

/**
 * Renders what a dry run reports: where it would deploy, what it would retire, how each artifact resolved, and every
 * write and retraction that it would perform.
 */
export function renderDryRunReport(outcome: SyncOutcome): ReadonlyArray<ReportLine> {
  if (outcome.kind === 'no-declaration') {
    return [{ level: 'info', text: describeMissingDeclaration(outcome) }];
  }

  const { plan } = outcome;
  const lines: Array<ReportLine> = [{ level: 'info', text: describeHarnessTargeting(plan.targets) }];

  for (const retirement of plan.retirements) {
    lines.push(describeRetirement(retirement, false));
  }
  if (plan.resolutionReport.length > 0) {
    lines.push({ level: 'info', text: renderResolutionReport(plan.resolutionReport) });
  }
  lines.push(
    { level: 'info', text: '[dry-run] sync would:' },
    ...describePlannedWrites(plan),
    ...describePlannedRetractions(plan),
    ...describePlannedDroppedHarnesses(plan),
  );
  for (const promptsPath of plan.promptsYmlPaths) {
    lines.push({
      level: 'info',
      text: `  reconcile prompts.yml ${promptsPath} (write the codeassembly region, or strip it when no skills remain)`,
    });
  }
  lines.push(...describeDamagedDroppedHosts(plan));
  for (const hostPath of plan.unignoredHosts) {
    lines.push(describeUnignoredHost(hostPath));
  }
  // Reported here as well as on a live run: Each names a property of the declaration rather than of the writes, and a
  // dry run is when a declaration gets checked before it is committed to.
  lines.push(
    ...plan.missingSources.map(describeMissingSource),
    ...plan.guidanceHookAdvisories.map(describeGuidanceHookAdvisory),
  );
  return lines;
}

/**
 * Renders what a live run reports: where it deployed, what it retired, what it delivered and retracted, and every
 * warning that the run raised.
 */
export function renderSyncReport(outcome: SyncOutcome): ReadonlyArray<ReportLine> {
  if (outcome.kind === 'no-declaration') {
    return [{ level: 'info', text: describeMissingDeclaration(outcome) }];
  }

  const { plan } = outcome;
  const lines: Array<ReportLine> = [{ level: 'info', text: describeHarnessTargeting(plan.targets) }];

  for (const retirement of plan.retirements) {
    lines.push(describeRetirement(retirement, true));
  }
  lines.push(...describeDroppedHarnesses(plan));
  for (const { hostPath, plan: hostPlan } of plan.ambientHosts) {
    const reason = hostPlan.kind === 'skip' ? describeAmbientSkip(hostPlan.reason, hostPath) : undefined;
    if (reason !== undefined) {
      lines.push({ level: 'warn', text: `⚠️ Skipping ambient delivery: ${reason}` });
    }
  }
  lines.push(...describeDamagedDroppedHosts(plan));
  for (const hostPath of plan.unignoredHosts) {
    lines.push(describeUnignoredHost(hostPath));
  }
  lines.push(...plan.missingSources.map(describeMissingSource), { level: 'info', text: describeDeliveries(plan) });

  const shadows = plan.resolutionReport.filter((entry) => entry.shadowsLibrary);
  if (shadows.length > 0) {
    lines.push({ level: 'warn', text: renderShadowWarning(shadows) });
  }
  if (plan.undeclaredPackages.length > 0) {
    lines.push({ level: 'info', text: renderPackageAdvice(plan.undeclaredPackages) });
  }
  // The size block closes the report: the bulkiest part, placed after the advisories, which name things to act on.
  lines.push(...plan.guidanceHookAdvisories.map(describeGuidanceHookAdvisory), ...describeSizes(outcome.sizes));
  return lines;
}

// region | Helpers

/** Orders resolution entries by artifact type, then by slug, so the report is deterministic. */
function compareResolutionEntries(a: ResolutionEntry, b: ResolutionEntry): number {
  if (a.type !== b.type) {
    return ARTIFACT_TYPE_ORDER[a.type] - ARTIFACT_TYPE_ORDER[b.type];
  }
  return a.slug.localeCompare(b.slug);
}

/** Totals the orphan paths found by one retraction pass across the directories that it swept. */
function countOrphans(byDir: ReadonlyArray<{ readonly orphans: ReadonlyArray<string> }>): number {
  return byDir.reduce((total, entry) => total + entry.orphans.length, 0);
}

/** The dry-run line for one host's plan, naming the host and the action that a real run would take on it. */
function describeAmbientHostPlan(hostPath: string, plan: AmbientHostPlan): ReportLine | undefined {
  if (plan.kind === 'skip') {
    const reason = describeAmbientSkip(plan.reason, hostPath);
    return reason === undefined ? undefined : { level: 'info', text: `  skip ambient delivery: ${reason}` };
  }
  switch (plan.action) {
    case 'append':
      return { level: 'info', text: `  append the ambient region to ${hostPath}` };
    case 'create':
      return { level: 'info', text: `  create ${hostPath}, containing the ambient region` };
    case 'inject':
      return { level: 'info', text: `  inject the ambient region in ${hostPath}` };
  }
}

/**
 * The reason one ambient host is skipped, or `undefined` when the skip is not worth reporting. A scope declaring
 * nothing ambient is an ordinary outcome rather than news, so neither path reports it; every other cause names a
 * problem that the user can act on, and both paths report it in these same words.
 */
function describeAmbientSkip(reason: AmbientSkipReason, hostPath: string): string | undefined {
  switch (reason.cause) {
    case 'damaged-region':
      return describeDamagedRegion(hostPath);
    case 'not-needed':
      return undefined;
    case 'stale-install':
      return describeStaleAmbientHost(reason.status, hostPath);
  }
}

/** The parenthesized detail beside one change: its size after the deployment, or the word that a size cannot state. */
function describeChangeDetail(change: DocumentChange): string {
  switch (change.kind) {
    case 'added':
      return `added, ${formatBytes(change.bytes)}`;
    case 'removed':
      return 'removed';
    case 'resized':
      return formatBytes(change.bytes);
  }
}

/**
 * The warning for each dropped harness whose ambient host the sweep declines to touch. Emitted at the report's top
 * level, beside the ambient-delivery skips that it mirrors, rather than inside the harness's block: Nothing was
 * retracted there, and a run that says only what it removed reads clean over guidance withdrawn by the declaration.
 */
function describeDamagedDroppedHosts(plan: SyncPlan): ReadonlyArray<ReportLine> {
  return plan.droppedHarnesses.flatMap((retraction): ReadonlyArray<ReportLine> =>
    retraction.ambientHost?.kind === 'damaged'
      ? [
          {
            level: 'warn',
            text:
              `⚠️ Skipping ambient retraction: ${describeDamagedRegion(retraction.ambientHost.path)} Repair the ` +
              'codeassembly-ambient markers and re-run, or the withdrawn guidance keeps loading.',
          },
        ]
      : [],
  );
}

/** The sentence naming a host whose ambient region no transform may touch. */
function describeDamagedRegion(hostPath: string): string {
  return `${hostPath} has a damaged ambient region.`;
}

/** The closing summary: what the run resolved, what it delivered across the targeted harnesses, and what it retracted. */
function describeDeliveries(plan: SyncPlan): string {
  const skillFilesWritten = plan.resolved.filter((rulebook) => rulebook.skill).length * plan.harnessSkillTargets.length;
  const declaredSkillsDeployed = plan.harnessSkillTargets.reduce(
    (total, { harnessId }) =>
      total + plan.resolvedSkills.filter((skill) => skillTargetsHarness(skill, harnessId)).length,
    0,
  );
  const subagentsDeployed = plan.resolvedSubagents.length * plan.harnessSubagentTargets.length;
  return (
    `Synced ${plan.resolved.length} rulebook(s), ${plan.resolvedSkills.length} declared skill(s), and ` +
    `${plan.resolvedSubagents.length} declared subagent(s); delivered ${skillFilesWritten} rulebook-skill file(s), ` +
    `${declaredSkillsDeployed} declared-skill dir(s), and ${subagentsDeployed} declared-subagent file(s) across ` +
    `${plan.harnessSkillTargets.length} harness(s); retracted ` +
    `${countOrphans(plan.skillOrphansByDir)} rulebook-skill dir(s), ` +
    `${countOrphans(plan.declaredSkillOrphansByDir)} declared-skill dir(s), and ` +
    `${countOrphans(plan.subagentOrphansByDir)} declared-subagent file(s).`
  );
}

/** What this deployment did to one document: its change, its key, and its size after the deployment. */
function describeDocumentChange(change: DocumentChange, deltaWidth: number): ReportLine {
  const detail = describeChangeDetail(change);
  return { level: 'info', text: `  ${formatDelta(change.delta).padStart(deltaWidth)}  ${change.key}  (${detail})` };
}

/**
 * The lines naming what one dropped harness still holds: one for each path removed and each region stripped. `verbs`
 * supplies the tense, so a preview reads as what a run would do and a run as what it did.
 */
function describeDroppedHarness(retraction: DroppedHarnessRetraction, verbs: RetractionVerbs): ReadonlyArray<string> {
  const lines = [
    ...retraction.skillDirs.map((skillDir) => `${verbs.remove} skill ${skillDir}`),
    ...retraction.subagentFiles.map((subagentFile) => `${verbs.remove} subagent ${subagentFile}`),
    ...retraction.supportPaths.map((supportPath) => `${verbs.remove} source support ${supportPath}`),
  ];
  // A damaged host is reported as a warning of its own, so it contributes no line to the actions block.
  if (retraction.ambientHost !== undefined && retraction.ambientHost.kind !== 'damaged') {
    lines.push(describeHostRetraction(retraction.ambientHost, 'ambient', verbs));
  }
  if (retraction.promptsYml !== undefined) {
    lines.push(describeHostRetraction(retraction.promptsYml, 'codeassembly', verbs));
  }
  return lines;
}

/**
 * The live-run lines for the dropped-harness sweep, one headed block per harness. Headed rather than counted into the
 * closing summary: That sentence reconciles the targeted set, and a harness leaving that set is a different event.
 */
function describeDroppedHarnesses(plan: SyncPlan): ReadonlyArray<ReportLine> {
  return plan.droppedHarnesses.flatMap((retraction): ReadonlyArray<ReportLine> => {
    const removals = describeDroppedHarness(retraction, PERFORMED_VERBS);
    return removals.length === 0
      ? []
      : [
          { level: 'info', text: `\nRetracted harness dropped from the declaration: ${retraction.harnessId}` },
          ...removals.map((text): ReportLine => ({ level: 'info', text: `  ${text}` })),
        ];
  });
}

/**
 * The warning for one document that has just reached the growth ceiling. It names `streamline-guidance` only where
 * the reader maintains the source behind the document; elsewhere the crossing is worth stating and the remedy is not
 * theirs to apply.
 */
function describeGrowthWarning(warning: GrowthWarning): ReportLine {
  const remedy = warning.mayStreamline ? ' Run the `streamline-guidance` skill on its source to reduce it.' : '';
  const ceiling = formatBytes(GROWTH_CEILING_BYTES);
  return {
    level: 'warn',
    text: `⚠️ ${warning.key} has passed the ${ceiling} growth ceiling (${formatBytes(warning.bytes)}).${remedy}`,
  };
}

/**
 * Renders one guidance-hook advisory. `bound-undeclared` names both remedies because the reader may control only
 * one: A rulebook resolved from the library has frontmatter that they cannot edit, leaving the binding as the half
 * that is theirs.
 *
 * `bound-unreached` is info rather than a warning: A home-tier binding applies to every project, so a project that
 * deploys nothing declaring the hook would see a warning on every sync.
 */
function describeGuidanceHookAdvisory(advisory: GuidanceHookAdvisory): ReportLine {
  switch (advisory.kind) {
    case 'bound-undeclared':
      return {
        level: 'warn',
        text:
          `⚠️ Guidance hook "${advisory.hook}" binds rulebook "${advisory.slug}", whose delivery does not name ` +
          "`hook`. Add `hook` to the rulebook's delivery, or drop the binding.",
      };
    case 'bound-unreached':
      return {
        level: 'info',
        text:
          `💡 Guidance hook "${advisory.hook}" is bound, but no deployed skill or subagent declares it, so the ` +
          'binding delivers nothing. Check the hook name, or declare a skill or subagent that declares it.',
      };
    case 'declared-unbound':
      return {
        level: 'info',
        text:
          `💡 Rulebook "${advisory.slug}" offers guidance-hook delivery that nothing binds. To use it, name the ` +
          'rulebook under a hook in the `guidance-hooks:` block of .agents/codeassembly.yaml.',
      };
  }
}

/** Names what retraction does to one host containing a sync-owned region: delete the file, or strip the region. */
function describeHostRetraction(retraction: HostRetraction, region: string, verbs: RetractionVerbs): string {
  return retraction.kind === 'delete'
    ? `${verbs.remove} ${retraction.path}`
    : `${verbs.strip} the ${region} region from ${retraction.path}`;
}

/** The advice for a scope that has no declaration to act on, naming the remedy that the global tier has. */
function describeMissingDeclaration(outcome: MissingDeclaration): string {
  return outcome.scope === 'global'
    ? `No ${outcome.declarationPath} found. Run \`codeassembly init --global\` to create one, then re-run \`sync --global\`.`
    : 'No .agents/codeassembly.yaml found. Nothing to sync.';
}

/** The dry-run lines for the dropped-harness sweep, each harness's paths nested under a header naming it. */
function describePlannedDroppedHarnesses(plan: SyncPlan): ReadonlyArray<ReportLine> {
  return plan.droppedHarnesses.flatMap((retraction): ReadonlyArray<ReportLine> => {
    const removals = describeDroppedHarness(retraction, PLANNED_VERBS);
    return removals.length === 0
      ? []
      : [
          { level: 'info', text: `  retract harness dropped from the declaration: ${retraction.harnessId}` },
          ...removals.map((text): ReportLine => ({ level: 'info', text: `    ${text}` })),
        ];
  });
}

/** The dry-run lines for every retraction that a run would perform, across the three delivery namespaces. */
function describePlannedRetractions(plan: SyncPlan): ReadonlyArray<ReportLine> {
  const lines: Array<ReportLine> = [];
  for (const { skillsDir, orphans } of plan.skillOrphansByDir) {
    for (const dir of orphans) {
      lines.push({
        level: 'info',
        text: `  retract skill ${path.join(skillsDir, dir)} (no longer the current skill dir)`,
      });
    }
  }
  for (const { skillsDir, orphans } of plan.declaredSkillOrphansByDir) {
    for (const dir of orphans) {
      lines.push({ level: 'info', text: `  retract declared skill ${path.join(skillsDir, dir)} (no longer declared)` });
    }
  }
  for (const { subagentsDir, orphans } of plan.subagentOrphansByDir) {
    for (const file of orphans) {
      lines.push({
        level: 'info',
        text: `  retract declared subagent ${path.join(subagentsDir, file)} (no longer declared)`,
      });
    }
  }
  return lines;
}

/** The dry-run lines for every write that a run would perform, in the order the delivery passes run. */
function describePlannedWrites(plan: SyncPlan): ReadonlyArray<ReportLine> {
  const lines: Array<ReportLine> = [];
  for (const { hostPath, plan: hostPlan } of plan.ambientHosts) {
    const line = describeAmbientHostPlan(hostPath, hostPlan);
    if (line !== undefined) {
      lines.push(line);
    }
  }
  for (const rulebook of plan.resolved) {
    if (rulebook.skill) {
      for (const { skillsDir } of plan.harnessSkillTargets) {
        lines.push({ level: 'info', text: `  write ${path.join(skillsDir, rulebook.skillName, 'SKILL.md')}` });
      }
    }
  }
  for (const skill of plan.resolvedSkills) {
    for (const { skillsDir, harnessId } of plan.harnessSkillTargets) {
      if (skillTargetsHarness(skill, harnessId)) {
        lines.push({ level: 'info', text: `  deploy declared skill ${path.join(skillsDir, skill.slug)}` });
      }
    }
  }
  for (const text of describeSourceSupport(plan.sourceSupportPlans, plan.sourceSupportRetractions)) {
    lines.push({ level: 'info', text });
  }
  for (const subagent of plan.resolvedSubagents) {
    for (const target of plan.harnessSubagentTargets) {
      lines.push({
        level: 'info',
        text: `  deploy declared subagent ${path.join(target.subagentsDir, `${subagent.slug}.md`)}`,
      });
    }
  }
  return lines;
}

/** What one retirement did to a legacy output, or would do had the run not been a dry run. */
function describeRetirement(retirement: Retirement, performed: boolean): ReportLine {
  if (retirement.kind === 'neutral-rulebooks') {
    return {
      level: 'info',
      text: performed
        ? `Retired the neutral rulebook tree ${retirement.dir}`
        : `[dry-run] sync would retire the neutral rulebook tree ${retirement.dir}`,
    };
  }
  if (retirement.emptied) {
    return {
      level: 'info',
      text: performed
        ? `Deleted ${retirement.hostPath}, which contained only retired rulebook blocks`
        : `[dry-run] sync would delete ${retirement.hostPath}, which contains only retired rulebook blocks`,
    };
  }
  return {
    level: 'info',
    text: performed
      ? `Retired the rulebook blocks in ${retirement.hostPath}`
      : `[dry-run] sync would retire the rulebook blocks in ${retirement.hostPath}`,
  };
}

/**
 * The size block that closes a live run's report: what changed, what has just grown past the ceiling, the three
 * aggregates, and the command that ranks every deployed document.
 *
 * The aggregates carry no overlap disclaimer here. The block labels the three totals separately and prints no
 * combined total, so nothing implies that they sum, and the closing line points at the command that carries the
 * explanation.
 */
function describeSizes(sizes: SizeReportOutcome | undefined): ReadonlyArray<ReportLine> {
  if (sizes === undefined) {
    return [];
  }
  if (sizes.kind === 'failed') {
    return [{ level: 'warn', text: `⚠️ The deployment's sizes were not recorded: ${sizes.message}` }];
  }
  return renderSizeReport(sizes.report);
}

/**
 * Renders the dry-run lines for the source-support pass: what each namespace gains, which ones delivery empties
 * because their source ships nothing, and which ones retraction removes because no source claims them.
 */
function describeSourceSupport(
  plans: ReadonlyArray<SourceSupportPlan>,
  retractions: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const lines = plans
    .filter((plan) => plan.kind !== 'none')
    .map((plan) =>
      plan.kind === 'deliver'
        ? `  deliver ${plan.entries.length} source support file(s) to ${plan.destDir}`
        : `  retract source support ${plan.destDir} (source ships none)`,
    );
  return [...lines, ...retractions.map((retraction) => `  retract source support ${retraction} (no longer declared)`)];
}

/** The reason a harness-home guidance file is too stale to receive ambient delivery, naming the remedy. */
function describeStaleAmbientHost(status: 'malformed' | 'missing' | 'no-region', guidanceFile: string): string {
  switch (status) {
    case 'missing':
      return `${guidanceFile} does not exist. Run \`codeassembly install\`, then re-run \`sync --global\`.`;
    case 'no-region':
      return `${guidanceFile} has no ambient region. Run \`codeassembly install\` to refresh it, then re-run \`sync --global\`.`;
    case 'malformed':
      return `${guidanceFile} has a damaged ambient region: an unmatched marker, or more than one region. Repair its codeassembly-ambient markers, then re-run \`sync --global\`.`;
  }
}

/** The advisory naming a host that a run writes and that git does not ignore. */
function describeUnignoredHost(hostPath: string): ReportLine {
  return {
    level: 'warn',
    text:
      `⚠️ ${hostPath} is not git-ignored. It contains machine-local guidance, so add it to .gitignore to keep it ` +
      'out of version control.',
  };
}

/**
 * Renders the advice naming each dependency that ships content that the project has not declared, as the `packages:`
 * block that adopts them. Emitted as the block rather than as prose so that it can be pasted rather than transcribed.
 */
function renderPackageAdvice(names: ReadonlyArray<string>): string {
  const subject = names.length === 1 ? 'dependency ships' : 'dependencies ship';
  const entries = names.map((name) => `    - '${name}'`).join('\n');
  return (
    `💡 ${names.length} ${subject} CodeAssembly guidance that this project has not declared. ` +
    `To adopt, add to .agents/codeassembly.yaml:\n\npackages:\n  use:\n${entries}\n`
  );
}

/**
 * Renders the per-artifact resolution report, sorted by type then slug: each deployed artifact and the source from
 * which it resolved (`← library` or `← source "<name>"`), with `(shadows library)` appended on a shadow. Type and slug
 * columns are padded for scannability. Pure and deterministic for a given entry set.
 */
function renderResolutionReport(entries: ReadonlyArray<ResolutionEntry>): string {
  const sorted = entries.toSorted(compareResolutionEntries);
  const typeWidth = Math.max(...sorted.map((entry) => entry.type.length));
  const slugWidth = Math.max(...sorted.map((entry) => entry.slug.length));
  const lines = sorted.map((entry) => {
    const origin = entry.source === undefined ? 'library' : `source "${entry.source}"`;
    const shadow = entry.shadowsLibrary ? ' (shadows library)' : '';
    return `  ${entry.type.padEnd(typeWidth)}  ${entry.slug.padEnd(slugWidth)}  ← ${origin}${shadow}`;
  });
  return ['[dry-run] sync would resolve:', ...lines].join('\n');
}

/** Renders the real-run warning naming each deployed artifact that shadows a same-slug library artifact. */
function renderShadowWarning(shadows: ReadonlyArray<ResolutionEntry>): string {
  const details = shadows
    .toSorted(compareResolutionEntries)
    .map((entry) => `${entry.type} "${entry.slug}" (source "${entry.source}")`)
    .join(', ');
  const plural = shadows.length === 1 ? '' : 's';
  const verb = shadows.length === 1 ? 's' : '';
  return `⚠️ ${shadows.length} artifact${plural} shadow${verb} a library slug: ${details}`;
}

/** Renders one measured deployment's size block, in the order stated by `describeSizes`. */
function renderSizeReport(report: SizeReport): ReadonlyArray<ReportLine> {
  const lines: Array<ReportLine> = [
    { level: 'info', text: '' },
    { level: 'info', text: 'Deployed sizes:' },
  ];
  if (report.isFirstRecorded) {
    lines.push({ level: 'info', text: '  This is the first recorded deployment here, so nothing is compared to it.' });
  }
  const deltaWidth = Math.max(0, ...report.changes.map((change) => formatDelta(change.delta).length));
  lines.push(
    ...report.changes.map((change) => describeDocumentChange(change, deltaWidth)),
    ...report.warnings.map(describeGrowthWarning),
    { level: 'info', text: '' },
    ...renderAggregates(report.aggregates, report.documentCount),
    { level: 'info', text: '' },
    { level: 'info', text: 'Run `codeassembly sizes` to rank every deployed document by size.' },
  );
  return lines;
}

// endregion | Helpers
