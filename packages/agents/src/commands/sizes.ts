import { homedir } from 'node:os';
import process from 'node:process';

import { readLatestSnapshot } from '../deployed-sizes/read-record.ts';
import { resolveRecordPath } from '../deployed-sizes/resolve-record-path.ts';
import type { SizeSnapshot } from '../deployed-sizes/types.ts';
import { emitReport } from '../lib/emit-report.ts';
import type { ReportLine } from '../lib/report-line.ts';
import { resolveRepo } from '../shared/resolve-repo.ts';

/** Bytes in one kibibyte, the unit in which a deployment's sizes are readable. */
const BYTES_PER_KIB = 1_024;

/**
 * Reports the latest snapshot of the domain matching the working directory, or of the home domain under `--global`,
 * ranking its documents by descending size with the three aggregates beneath them.
 *
 * It reads the record rather than the deployed tree, so it answers from a worktree that never deploys. An absent
 * record is the ordinary case for such a worktree, so it prints the sync that would create one rather than failing.
 */
export async function sizesCommand(
  options: { global: boolean },
  cwd: string = process.cwd(),
  homeDir: string = homedir(),
): Promise<void> {
  const recordPath = resolveRecordPath(
    options.global
      ? { home: homeDir, domain: 'home' }
      : { home: homeDir, domain: 'repo', repo: await resolveRepo(cwd) },
  );
  emitReport(renderSizesReport(await readLatestSnapshot(recordPath), options.global));
}

/**
 * Renders what the command reports: the ranking and the aggregates, or the sync that would create an absent record.
 * Assets are excluded from the ranking, which answers what a session loads, and reported as the asset total alone.
 */
export function renderSizesReport(snapshot: SizeSnapshot | undefined, global: boolean): ReadonlyArray<ReportLine> {
  if (snapshot === undefined) {
    const command = global ? 'codeassembly sync --global' : 'codeassembly sync';
    return [{ level: 'info', text: `No deployment has been recorded here. Run \`${command}\` to record one.` }];
  }
  return renderSnapshot(snapshot);
}

// region | Helpers

/**
 * Renders one byte count at the scale that keeps it readable: kibibytes to one decimal place above a kibibyte, and
 * bytes below it, so that a description of a few dozen bytes is distinguishable from nothing at all.
 */
function formatBytes(bytes: number): string {
  return bytes < BYTES_PER_KIB ? `${bytes} B` : `${(bytes / BYTES_PER_KIB).toFixed(1)} KiB`;
}

/** Renders one snapshot's document ranking and the three aggregates beneath it. */
function renderSnapshot(snapshot: SizeSnapshot): ReadonlyArray<ReportLine> {
  const documents = Object.entries(snapshot.documents)
    .filter(([, document]) => document.kind === 'document')
    .map(([key, document]) => ({ key, bytes: document.bytes }))
    .toSorted((left, right) => right.bytes - left.bytes || left.key.localeCompare(right.key));

  const width = Math.max(0, ...documents.map((document) => formatBytes(document.bytes).length));
  const lines: Array<ReportLine> = [
    { level: 'info', text: `Deployment recorded ${snapshot.recordedAt} by codeassembly ${snapshot.version}` },
    { level: 'info', text: '' },
  ];
  for (const document of documents) {
    lines.push({ level: 'info', text: `  ${formatBytes(document.bytes).padStart(width)}  ${document.key}` });
  }

  const { alwaysLoaded, onInvocation, assets } = snapshot.aggregates;
  lines.push(
    { level: 'info', text: '' },
    { level: 'info', text: `Always loaded:  ${formatBytes(alwaysLoaded.total)}` },
    { level: 'info', text: `  ambient regions:       ${formatBytes(alwaysLoaded.ambientRegions)}` },
    { level: 'info', text: `  skill descriptions:    ${formatBytes(alwaysLoaded.skillDescriptions)}` },
    { level: 'info', text: `  subagent descriptions: ${formatBytes(alwaysLoaded.subagentDescriptions)}` },
    { level: 'info', text: `On invocation:  ${formatBytes(onInvocation)} across ${documents.length} document(s)` },
    { level: 'info', text: `Assets:         ${formatBytes(assets)}` },
    { level: 'info', text: '' },
    {
      level: 'info',
      text: 'A description is counted in the always-loaded total and again inside its document, so the totals do not sum to a whole.',
    },
  );
  return lines;
}

// endregion | Helpers
