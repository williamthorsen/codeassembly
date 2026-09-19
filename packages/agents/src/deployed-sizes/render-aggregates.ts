import type { ReportLine } from '../lib/report-line.ts';
import { formatBytes } from './format-bytes.ts';
import type { SizeAggregates } from './types.ts';

/**
 * Renders the three-aggregate block: the always-loaded total with its three components indented beneath it, then the
 * on-invocation total across `documentCount` documents, then the asset total.
 *
 * The block alone, with no separator and no disclaimer around it, so that each caller places it in its own report.
 * The totals overlap rather than partition, so whatever presents them must say so where the block is placed.
 */
export function renderAggregates(aggregates: SizeAggregates, documentCount: number): ReadonlyArray<ReportLine> {
  const { alwaysLoaded, onInvocation, assets } = aggregates;
  return [
    { level: 'info', text: `Always loaded:  ${formatBytes(alwaysLoaded.total)}` },
    { level: 'info', text: `  ambient regions:       ${formatBytes(alwaysLoaded.ambientRegions)}` },
    { level: 'info', text: `  skill descriptions:    ${formatBytes(alwaysLoaded.skillDescriptions)}` },
    { level: 'info', text: `  subagent descriptions: ${formatBytes(alwaysLoaded.subagentDescriptions)}` },
    { level: 'info', text: `On invocation:  ${formatBytes(onInvocation)} across ${documentCount} document(s)` },
    { level: 'info', text: `Assets:         ${formatBytes(assets)}` },
  ];
}
