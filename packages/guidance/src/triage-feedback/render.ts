/** Renders the triage artifact's body from a triage record. */
import { type Cluster, orderClusters, type Suggestion, type TriageRecord } from './record-schema.ts';

const IMPACT_ORDER = ['critical', 'high', 'medium', 'low', 'unrated'] as const;

/** Renders the artifact: the surfaced clusters as one table, the remainder line, and each cluster's event ids. */
export function renderArtifact(record: TriageRecord): string {
  const surfaced = orderClusters(record.clusters).filter((cluster) => cluster.surfaced);
  const lines = [
    '# Feedback triage',
    '',
    `Store: \`${record.store}\`. Limit: ${record.limit}.`,
    '',
    '| Cluster | Lesson | Recurrence | Impact | Latest | Priority | Reason | Challenge | Disposition | Decision | Result |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...surfaced.map((cluster) => renderRow(cluster)),
    '',
    renderRemainder(record),
    '',
    '## Events',
    '',
    ...surfaced.map(
      (cluster) =>
        `- \`${cluster.id}\` in \`${record.store}\`: ${cluster.eventIds.map((id) => `\`${id}\``).join(', ')}`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}

/** Renders the one line that accounts for the clusters that the run did not surface. */
export function renderRemainder(record: TriageRecord): string {
  const { clusters, events, excluded } = record.remainder;
  return `${clusters} more ${plural(clusters, 'cluster')}, ${events} ${plural(events, 'event')}, remain in the pool; ${excluded} deferred ${plural(excluded, 'cluster')} ${excluded === 1 ? 'is' : 'are'} excluded.`;
}

/** Describes a disposition in a few words. */
export function describeSuggestion(suggestion: Suggestion): string {
  switch (suggestion.kind) {
    case 'ticket-existing':
      return `ticket against \`${suggestion.target}\` in ${suggestion.repo}`;
    case 'ticket-new':
      return `ticket for new \`${suggestion.target}\` in ${suggestion.repo}`;
    case 'ticket-undecided':
      return `ticket, target undecided, in ${suggestion.repo}`;
    case 'impact':
      return `set impact to ${suggestion.level}`;
    case 'defer':
      return 'defer';
    default: {
      const _exhaustive: never = suggestion;
      throw new Error(`unhandled suggestion: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Describes a cluster's impact ratings, highest level first, omitting the levels without any events. */
export function describeImpact(impact: Cluster['signals']['impact']): string {
  return IMPACT_ORDER.filter((level) => impact[level] > 0)
    .map((level) => `${impact[level]} ${level}`)
    .join(', ');
}

// region | Helpers

/** Describes the challenge's outcome, with the priority that it replaced. */
function describeChallenge(cluster: Cluster): string {
  const { outcome, originalPriority } = cluster.challenge;
  return originalPriority === undefined ? outcome : `${outcome} (was ${originalPriority})`;
}

/** Describes what the writes produced so far. */
function describeResult(cluster: Cluster): string {
  if (cluster.decision === 'declined') return 'not applied';
  if (cluster.result === undefined || cluster.result === null) return 'pending';
  const parts = [
    ...(cluster.result.ticket === undefined ? [] : [cluster.result.ticket]),
    cluster.result.marked ? 'events marked' : 'events not marked',
  ];
  return parts.join('; ');
}

/** Escapes the characters that would break a Markdown table cell. */
function escapeCell(text: string): string {
  return text
    .replaceAll('|', String.raw`\|`)
    .replaceAll(/\r?\n/g, ' ')
    .trim();
}

/** Returns `noun`, pluralized for a count other than one. */
function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

/** Renders one table row. */
function renderRow(cluster: Cluster): string {
  const disposition = cluster.suggested === undefined ? '' : describeSuggestion(cluster.suggested);
  const cells = [
    `\`${cluster.id}\``,
    cluster.lesson,
    String(cluster.signals.recurrence),
    describeImpact(cluster.signals.impact),
    cluster.signals.latestCapturedAt.slice(0, 10),
    cluster.priority,
    cluster.reason,
    describeChallenge(cluster),
    disposition,
    cluster.decision ?? '',
    describeResult(cluster),
  ];
  return `| ${cells.map((cell) => escapeCell(cell)).join(' | ')} |`;
}

// endregion | Helpers
