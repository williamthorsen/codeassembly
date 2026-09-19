import type { FeedbackMemorySummary, ProjectSummary, SkippedMemory } from './types.ts';

const EMOJI = '📦';
const GAP = '  ';
const INDENT = ' '.repeat(3);
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Renders a feedback-memory summary as human-readable text: a three-column table by default, or, under `verbose`, each
 * project followed by its memories. Grouping, counting, and sorting belong to `summarizeFeedbackMemories`.
 */
export function reportSummary(summary: FeedbackMemorySummary, options: { verbose?: boolean; width: number }): string {
  const verbose = options.verbose ?? false;
  const footer = skippedFooter(summary.skipped, verbose);

  if (summary.projects.length === 0) {
    return footer === '' ? 'No feedback memories found.' : `No feedback memories found.\n${footer}`;
  }
  const body = verbose ? verboseBody(summary.projects, options.width) : tableBody(summary.projects);
  const totals = footer === '' ? totalLine(summary) : `${totalLine(summary)}\n${footer}`;
  return `${body}\n\n${totals}`;
}

// region | Helpers

/** Renders the bare three-column table: a header row followed by one aligned row per project. */
function tableBody(projects: readonly ProjectSummary[]): string {
  const rows = projects.map((project) => ({
    project: `${EMOJI} ${project.label}`,
    count: String(project.count),
    modified: formatMtimeUtc(project.lastModified),
  }));
  const projectWidth = Math.max('Project'.length, ...rows.map((row) => row.project.length));
  const countWidth = Math.max('Memories'.length, ...rows.map((row) => row.count.length));

  const header = `${'Project'.padEnd(projectWidth)}${GAP}${'Memories'.padEnd(countWidth)}${GAP}Last modified`;
  const lines = rows.map(
    (row) => `${row.project.padEnd(projectWidth)}${GAP}${row.count.padEnd(countWidth)}${GAP}${row.modified}`,
  );
  return [header, ...lines].join('\n');
}

/** Renders the verbose form: a per-project header followed by each memory's slug and truncated description. */
function verboseBody(projects: readonly ProjectSummary[], width: number): string {
  return projects
    .map((project) => {
      const slugWidth = Math.max(0, ...project.memories.map((memory) => memory.slug.length));
      const room = width - INDENT.length - slugWidth - GAP.length;
      const lines = project.memories.map((memory) =>
        `${INDENT}${memory.slug.padEnd(slugWidth)}${GAP}${truncate(memory.description ?? '', room)}`.trimEnd(),
      );
      const heading = `${EMOJI} ${project.label}: ${project.count} ${pluralize(project.count, 'memory', 'memories')}`;
      return [heading, ...lines].join('\n');
    })
    .join('\n\n');
}

/** Renders the closing total: the memory count across the listed projects. */
function totalLine(summary: FeedbackMemorySummary): string {
  const memories = `${summary.total} feedback ${pluralize(summary.total, 'memory', 'memories')}`;
  const projects = `${summary.projects.length} ${pluralize(summary.projects.length, 'project', 'projects')}`;
  return `${memories} across ${projects}`;
}

/** Renders a warning for memory files that were detected but could not be read, listing paths under verbose; empty when none. */
function skippedFooter(skipped: readonly SkippedMemory[], verbose: boolean): string {
  if (skipped.length === 0) {
    return '';
  }
  const heading = `⚠️  ${skipped.length} ${pluralize(skipped.length, 'file', 'files')} skipped (unreadable)`;
  if (!verbose) {
    return heading;
  }
  return [`${heading}:`, ...skipped.map((entry) => `${INDENT}${entry.path}`)].join('\n');
}

/** Formats an ISO-8601 timestamp as `YYYY-MM-DD HH:MM UTC`. */
function formatMtimeUtc(iso: string): string {
  const date = new Date(iso);
  const day = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  return `${day} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())} UTC`;
}

/** Left-pads a number to two digits. */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Truncates text to `max` grapheme clusters, replacing the tail with an ellipsis that counts toward `max`; yields
 * empty text when max is not positive. Cutting on cluster boundaries keeps an emoji, a ZWJ sequence, or a combining
 * mark whole rather than splitting it. The count is clusters, not display columns, so a line holding a wide character
 * can still render past `max`.
 */
function truncate(text: string, max: number): string {
  if (max <= 0) {
    return '';
  }
  const clusters = Array.from(GRAPHEME_SEGMENTER.segment(text), (segment) => segment.segment);
  return clusters.length <= max ? text : `${clusters.slice(0, max - 1).join('')}…`;
}

/** Returns the singular or plural word for a count. */
function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

// endregion | Helpers
