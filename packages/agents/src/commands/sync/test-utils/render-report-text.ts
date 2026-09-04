import type { ReportLine } from '../../../lib/report-line.ts';
import type { SyncOutcome } from '../sync-plan.ts';
import { renderReportLines } from './render-report-lines.ts';

/** The text one sync outcome reports, joined as the user would read it down the terminal. */
export function renderReportText(
  outcome: SyncOutcome,
  options: { dryRun?: boolean; level?: ReportLine['level'] } = {},
): string {
  return renderReportLines(outcome, options).join('\n');
}
