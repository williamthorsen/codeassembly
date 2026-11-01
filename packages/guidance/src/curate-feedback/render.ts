import type { CurationRecord } from './schemas.ts';
import { BINS } from './types.ts';

/** Returns one line of counts per bin, as the skill reports them and the artifact opens with them. */
export function formatCounts(record: CurationRecord): string[] {
  return BINS.map((bin) => `- ${bin}: ${record.counts[bin]}`);
}

/** Renders the curation artifact's body: the counts, the marks with their results, and a table of every event. */
export function renderArtifact(record: CurationRecord): string {
  const lines = [
    '# Feedback curation',
    '',
    `Store: \`${record.store}\``,
    '',
    '## Counts',
    '',
    ...formatCounts(record),
    '',
    '## Pinned guidance',
    '',
    ...(record.pins.length === 0
      ? ['None.']
      : record.pins.map((pin) => `- \`${pin.repo}\` at \`${pin.sha}\` (\`${pin.branch}\`)`)),
    '',
    '## Marks',
    '',
  ];

  const marks = [
    ...record.marks.addressedBy.map(
      (group) =>
        `- addressed-by ${group.references.map((reference) => `<${reference}>`).join(', ')}: ${group.eventIds.length} ${pluralize(group.eventIds.length)} (${describeResult(group.result)})`,
    ),
    ...(record.marks.obsolete.eventIds.length === 0
      ? []
      : [
          `- tag \`obsolete\`: ${record.marks.obsolete.eventIds.length} ${pluralize(record.marks.obsolete.eventIds.length)} (${describeResult(record.marks.obsolete.result)})`,
        ]),
  ];
  const rows = record.events.map((event) => {
    const reference = event.reference ?? (event.duplicateOf === undefined ? '' : `duplicate of ${event.duplicateOf}`);
    return `| ${event.id} | ${escapeCell(event.summary)} | ${event.bin} | ${escapeCell(reference)} | ${escapeCell(event.reason ?? '')} |`;
  });
  lines.push(
    ...(marks.length === 0 ? ['None.'] : marks),
    '',
    '## Events',
    '',
    '| Event | Summary | Bin | Reference | Reason |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  );
  return `${lines.join('\n')}\n`;
}

// region | Helpers

/** Describes a mark's result: applied, failed with the ids that failed, or not applied. */
function describeResult(result: CurationRecord['marks']['obsolete']['result']): string {
  if (result === null) return 'not applied';
  return result.ok ? 'applied' : `failed for ${result.failed.join(', ')}`;
}

/** Escapes the characters that would break a Markdown table cell. */
function escapeCell(text: string): string {
  return text.replaceAll('|', String.raw`\|`).replaceAll(/\s*\n\s*/g, ' ');
}

/** Returns "event" or "events" for a count. */
function pluralize(count: number): string {
  return count === 1 ? 'event' : 'events';
}

// endregion | Helpers
