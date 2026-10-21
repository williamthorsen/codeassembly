import {
  countAccountedBytes,
  type DocumentChange,
  type ExpansionChange,
  GROWTH_CEILING_BYTES,
  type GrowthWarning,
  type SizeChange,
  type SizeReport,
} from '../../deployed-sizes/build-size-report.ts';
import { formatBytes, formatDelta } from '../../deployed-sizes/format-bytes.ts';
import { renderAggregates } from '../../deployed-sizes/render-aggregates.ts';
import type { ReportLine } from '../../lib/report-line.ts';
import type { SizeReportOutcome } from './record-deployed-sizes.ts';

/**
 * The size block that closes a live run's report: what changed, what has just grown past the ceiling, the three
 * aggregates, and the command that ranks every deployed document.
 *
 * The aggregates don't include an overlap disclaimer here. The block labels the three totals separately and doesn't
 * print a combined total, so nothing implies that they sum, and the closing line points at the command that gives the
 * explanation.
 */
export function describeSizes(sizes: SizeReportOutcome | undefined): ReadonlyArray<ReportLine> {
  if (sizes === undefined) {
    return [];
  }
  if (sizes.kind === 'failed') {
    return [{ glyph: 'warning', level: 'warn', text: `The deployment's sizes were not recorded: ${sizes.message}` }];
  }
  return renderSizeReport(sizes.report);
}

// region | Helpers

/** The parenthesized detail beside one change: its size after the deployment, or the word that a size cannot state. */
function describeChangeDetail(change: DocumentChange): string {
  switch (change.kind) {
    case 'added':
      return `added, ${formatBytes(change.bytes)}`;
    case 'removed':
      return 'removed';
    case 'resized':
      // A document whose growth its partials partly explain leads with the residual, which the word marks as such.
      return change.explained === 0 ? formatBytes(change.bytes) : `residual, ${formatBytes(change.bytes)}`;
  }
}

/** What this deployment did to one document: its change, its key, and its size after the deployment. */
function describeDocumentChange(change: DocumentChange, deltaWidth: number): ReportLine {
  return describeSizeChangeLine(change, deltaWidth, change.key, describeChangeDetail(change));
}

/**
 * What one changed expansion unit deployed: the bytes that its change explains, the unit, its per-document delta, the
 * documents whose change it explains, and its own size. The unit is named without its key's kind prefix, which puts
 * it in the same column as the deployed paths beside it, and the document count is the one that makes the line's own
 * arithmetic check out.
 */
function describeExpansionChange(change: ExpansionChange, deltaWidth: number): ReportLine {
  const count = change.explainedDocumentCount;
  const detail = `${formatDelta(change.delta)} × ${count} document${count === 1 ? '' : 's'}, ${formatBytes(change.bytes)}`;
  return describeSizeChangeLine(change, deltaWidth, stripKeyKind(change.key), detail);
}

/**
 * The warning for one document that has just reached the growth ceiling. It names `streamline-guidance` only when
 * the reader maintains the source behind the document; otherwise the crossing is worth stating and the remedy is not
 * theirs to apply.
 */
function describeGrowthWarning(warning: GrowthWarning): ReportLine {
  const remedy = warning.mayStreamline ? ' Run the `streamline-guidance` skill on its source to reduce it.' : '';
  const ceiling = formatBytes(GROWTH_CEILING_BYTES);
  return {
    glyph: 'warning',
    level: 'warn',
    text: `${warning.key} has passed the ${ceiling} growth ceiling (${formatBytes(warning.bytes)}).${remedy}`,
  };
}

/** One change's line: the bytes that it accounts for, the name that it is reported under, and its own detail. */
function describeSizeChangeLine(change: SizeChange, deltaWidth: number, name: string, detail: string): ReportLine {
  const accounted = formatDelta(countAccountedBytes(change)).padStart(deltaWidth);
  return { level: 'info', text: `  ${accounted}  ${name}  (${detail})` };
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
  // Computed across both kinds of change, so that the column stays aligned when the two interleave.
  const deltaWidth = Math.max(0, ...report.changes.map((change) => formatDelta(countAccountedBytes(change)).length));
  lines.push(
    ...report.changes.map((change) =>
      change.kind === 'expansion'
        ? describeExpansionChange(change, deltaWidth)
        : describeDocumentChange(change, deltaWidth),
    ),
    ...report.warnings.map(describeGrowthWarning),
    { level: 'info', text: '' },
    ...renderAggregates(report.aggregates, report.documentCount),
    { level: 'info', text: '' },
    { level: 'info', text: 'Run `codeassembly sizes` to rank every deployed document by size.' },
  );
  return lines;
}

/** The name under which one expansion key is reported: its `{source}/{relPath}` tail, without the kind that leads it. */
function stripKeyKind(key: string): string {
  const separator = key.indexOf(':');
  return separator === -1 ? key : key.slice(separator + 1);
}

// endregion | Helpers
