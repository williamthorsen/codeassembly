import path from 'node:path';

import { describeMissingSource } from '../../lib/declared-sources.ts';
import { artifactTargetsHarness } from '../../lib/harness.ts';
import type { ReportLine } from '../../lib/report-line.ts';
import { describeHarnessTargeting } from '../../lib/target-harnesses.ts';
import type { GuidanceHookAdvisory } from './hook-bindings.ts';
import { describeAmbientHostPlan, describeAmbientSkip, describeUnignoredHost } from './report-ambient.ts';
import { renderResolutionReport, renderShadowWarning } from './report-resolution.ts';
import {
  describeDamagedDroppedHosts,
  describeDroppedHarnesses,
  describePlannedDroppedHarnesses,
  describePlannedRetractions,
  describeRetirement,
} from './report-retractions.ts';
import { describeSizes } from './report-sizes.ts';
import type { SourceSupportPlan } from './source-support.ts';
import type { MissingDeclaration, SyncOutcome, SyncPlan } from './sync-plan.ts';

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
      text: `  reconcile prompts.yml ${promptsPath} (write the codeassembly region, or strip it when the harness doesn't have any skills left)`,
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
      lines.push({ glyph: 'warning', level: 'warn', text: `Skipping ambient delivery: ${reason}` });
    }
  }
  lines.push(...describeDamagedDroppedHosts(plan));
  for (const hostPath of plan.unignoredHosts) {
    lines.push(describeUnignoredHost(hostPath));
  }
  lines.push(...plan.missingSources.map(describeMissingSource), { level: 'info', text: describeDeliveries(plan) });

  const shadows = plan.resolutionReport.filter((entry) => entry.shadowedSources.length > 0);
  if (shadows.length > 0) {
    lines.push({ glyph: 'warning', level: 'warn', text: renderShadowWarning(shadows) });
  }
  if (plan.undeclaredPackages.length > 0) {
    lines.push(...renderPackageAdvice(plan.undeclaredPackages));
  }
  // The size block closes the report: the bulkiest part, placed after the advisories, which name things to act on.
  lines.push(...plan.guidanceHookAdvisories.map(describeGuidanceHookAdvisory), ...describeSizes(outcome.sizes));
  return lines;
}

// region | Helpers

/** Totals the orphan paths found by one retraction pass across the directories that it swept. */
function countOrphans(byDir: ReadonlyArray<{ readonly orphans: ReadonlyArray<string> }>): number {
  return byDir.reduce((total, entry) => total + entry.orphans.length, 0);
}

/** The closing summary: what the run resolved, what it delivered across the targeted harnesses, and what it retracted. */
function describeDeliveries(plan: SyncPlan): string {
  const skillFilesWritten = plan.harnessSkillTargets.reduce(
    (total, { harnessId }) =>
      total + plan.resolved.filter((rulebook) => rulebook.skill && artifactTargetsHarness(rulebook, harnessId)).length,
    0,
  );
  const declaredSkillsDeployed = plan.harnessSkillTargets.reduce(
    (total, { harnessId }) =>
      total + plan.resolvedSkills.filter((skill) => artifactTargetsHarness(skill, harnessId)).length,
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

/**
 * Renders one guidance-hook advisory. `bound-undeclared` names both remedies because the reader may control only
 * one: A rulebook resolved from another party's source has frontmatter that they cannot edit, leaving the binding as
 * the half that is theirs.
 *
 * `bound-unreached` is info rather than a warning: A home-tier binding applies to every project, so a project that
 * deploys nothing declaring the hook would see a warning on every sync.
 */
function describeGuidanceHookAdvisory(advisory: GuidanceHookAdvisory): ReportLine {
  switch (advisory.kind) {
    case 'bound-undeclared':
      return {
        glyph: 'warning',
        level: 'warn',
        text:
          `Guidance hook "${advisory.hook}" binds rulebook "${advisory.slug}", whose delivery does not name ` +
          "`hook`. Add `hook` to the rulebook's delivery, or drop the binding.",
      };
    case 'bound-unreached':
      return {
        glyph: 'hint',
        level: 'info',
        text:
          `Guidance hook "${advisory.hook}" is bound, but it isn't declared by any deployed skill or subagent, so the ` +
          'binding delivers nothing. Check the hook name, or declare a skill or subagent that declares it.',
      };
    case 'declared-unbound':
      return {
        glyph: 'hint',
        level: 'info',
        text:
          `Rulebook "${advisory.slug}" offers guidance-hook delivery that nothing binds. To use it, name the ` +
          'rulebook under a hook in the `guidance-hooks:` block of .agents/codeassembly.yaml.',
      };
  }
}

/** The advice for a scope without a declaration to act on, naming the remedy that the global tier has. */
function describeMissingDeclaration(outcome: MissingDeclaration): string {
  return outcome.scope === 'global'
    ? `No ${outcome.declarationPath} found. Run \`codeassembly init --global\` to create one, then re-run \`sync --global\`.`
    : 'No .agents/codeassembly.yaml found. Nothing to sync.';
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
  for (const reference of plan.references) {
    lines.push({ level: 'info', text: `  point reference "${reference.name}" at ${reference.displayPath}` });
  }
  for (const rulebook of plan.resolved) {
    if (rulebook.skill) {
      for (const { skillsDir, harnessId } of plan.harnessSkillTargets) {
        if (artifactTargetsHarness(rulebook, harnessId)) {
          lines.push({ level: 'info', text: `  write ${path.join(skillsDir, rulebook.skillName, 'SKILL.md')}` });
        }
      }
    }
  }
  for (const skill of plan.resolvedSkills) {
    for (const { skillsDir, harnessId } of plan.harnessSkillTargets) {
      if (artifactTargetsHarness(skill, harnessId)) {
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

/**
 * Renders the dry-run lines for the source-support pass: what each namespace gains, which ones delivery empties
 * because their source provides nothing, and which ones retraction removes because they aren't claimed by any source.
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
        : `  retract source support ${plan.destDir} (source provides none)`,
    );
  return [...lines, ...retractions.map((retraction) => `  retract source support ${retraction} (no longer declared)`)];
}

/**
 * Renders the advice naming each dependency that provides content that the project has not declared, as the `packages:`
 * block that adopts them. Emitted as the block rather than as prose so that it can be pasted rather than transcribed,
 * on a line of its own so that the glyph's gutter does not indent it.
 */
function renderPackageAdvice(names: ReadonlyArray<string>): ReadonlyArray<ReportLine> {
  const subject = names.length === 1 ? 'dependency provides' : 'dependencies provide';
  const entries = names.map((name) => `    - '${name}'`).join('\n');
  return [
    {
      glyph: 'hint',
      level: 'info',
      text:
        `${names.length} ${subject} CodeAssembly guidance that this project has not declared. ` +
        'To adopt, add to .agents/codeassembly.yaml:',
    },
    { level: 'info', text: `\npackages:\n  use:\n${entries}\n` },
  ];
}

// endregion | Helpers
