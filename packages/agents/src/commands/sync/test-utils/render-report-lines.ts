import type { ReportLine } from '../../../lib/report-line.ts';
import { renderDryRunReport, renderSyncReport } from '../report.ts';
import type { SyncOutcome } from '../sync-plan.ts';

/**
 * The lines that one sync outcome reports, a glyph line led by its glyph's name in brackets. `dryRun` picks the
 * renderer that the CLI would pick, and `level` narrows to a single stream for a suite asserting what reaches only
 * stdout or only stderr.
 */
export function renderReportLines(
  outcome: SyncOutcome,
  options: { dryRun?: boolean; level?: ReportLine['level'] } = {},
): ReadonlyArray<string> {
  const lines = options.dryRun === true ? renderDryRunReport(outcome) : renderSyncReport(outcome);
  return lines
    .filter((line) => options.level === undefined || line.level === options.level)
    .map((line) => ' '.repeat(line.indent ?? 0) + (line.glyph === undefined ? '' : `[${line.glyph}] `) + line.text);
}
