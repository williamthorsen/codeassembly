import path from 'node:path';

import type { ReportLine } from '../../lib/report-line.ts';
import type { DroppedHarnessRetraction, HostRetraction } from './harness-retraction.ts';
import type { Retirement } from './legacy-retirement.ts';
import { describeDamagedRegion } from './report-ambient.ts';
import type { SyncPlan } from './sync-plan.ts';

/** The verbs that a retraction line takes, so that the same renderer serves a preview and the run that it previews. */
interface RetractionVerbs {
  readonly remove: string;
  readonly strip: string;
}

const PERFORMED_VERBS: RetractionVerbs = { remove: 'removed', strip: 'stripped' };

const PLANNED_VERBS: RetractionVerbs = { remove: 'remove', strip: 'strip' };

/**
 * The warning for each dropped harness whose ambient host the sweep skips. Emitted at the report's top level, beside
 * the ambient-delivery skips that it mirrors, rather than inside the harness's block: Nothing was retracted there, and
 * a run that reports only what it removed looks clean while guidance that the declaration withdrew still loads.
 */
export function describeDamagedDroppedHosts(plan: SyncPlan): ReadonlyArray<ReportLine> {
  return plan.droppedHarnesses.flatMap((retraction): ReadonlyArray<ReportLine> =>
    retraction.ambientHost?.kind === 'damaged'
      ? [
          {
            glyph: 'warning',
            level: 'warn',
            text:
              `Skipping ambient retraction: ${describeDamagedRegion(retraction.ambientHost.path)} Repair the ` +
              'codeassembly-ambient markers and re-run, or the withdrawn guidance keeps loading.',
          },
        ]
      : [],
  );
}

/**
 * The live-run lines for the dropped-harness sweep, one headed block per harness. Headed rather than counted into the
 * closing summary: That sentence reconciles the targeted set, and a harness leaving that set is a different event.
 */
export function describeDroppedHarnesses(plan: SyncPlan): ReadonlyArray<ReportLine> {
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

/** The dry-run lines for the dropped-harness sweep, each harness's paths nested under a header naming it. */
export function describePlannedDroppedHarnesses(plan: SyncPlan): ReadonlyArray<ReportLine> {
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
export function describePlannedRetractions(plan: SyncPlan): ReadonlyArray<ReportLine> {
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

/** What one retirement did to a legacy output, or would do had the run not been a dry run. */
export function describeRetirement(retirement: Retirement, performed: boolean): ReportLine {
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

// region | Helpers

/**
 * The lines naming what one dropped harness still contains: one for each path removed and each region stripped.
 * `verbs` supplies the tense, so a preview reads as what a run would do and a run as what it did.
 */
function describeDroppedHarness(retraction: DroppedHarnessRetraction, verbs: RetractionVerbs): ReadonlyArray<string> {
  const lines = [
    ...retraction.skillDirs.map((skillDir) => `${verbs.remove} skill ${skillDir}`),
    ...retraction.subagentFiles.map((subagentFile) => `${verbs.remove} subagent ${subagentFile}`),
    ...retraction.supportPaths.map((supportPath) => `${verbs.remove} source support ${supportPath}`),
  ];
  // A damaged host is reported as a warning of its own, so it doesn't contribute a line to the actions block.
  if (retraction.ambientHost !== undefined && retraction.ambientHost.kind !== 'damaged') {
    lines.push(describeHostRetraction(retraction.ambientHost, 'ambient', verbs));
  }
  if (retraction.promptsYml !== undefined) {
    lines.push(describeHostRetraction(retraction.promptsYml, 'codeassembly', verbs));
  }
  return lines;
}

/** Names what retraction does to one host containing a sync-owned region: delete the file, or strip the region. */
function describeHostRetraction(retraction: HostRetraction, region: string, verbs: RetractionVerbs): string {
  return retraction.kind === 'delete'
    ? `${verbs.remove} ${retraction.path}`
    : `${verbs.strip} the ${region} region from ${retraction.path}`;
}

// endregion | Helpers
