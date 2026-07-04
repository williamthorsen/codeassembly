import type { FeedbackMemorySummary, ProjectSummary } from './types.ts';

const EMOJI = '📦';
const FALLBACK_WIDTH = 120;
const GAP = '  ';
const INDENT = '   ';

/**
 * Renders a feedback-memory summary as human-readable text. The bare form is a three-column table (project, memory
 * count, newest modification time) under a header, closed by a total line; `verbose` instead lists each project with its
 * memories, one per line, each description truncated to the available width. Does no data work — grouping, counting, and
 * sorting all happen upstream in `summarizeFeedbackMemories`; this only lays the summary out.
 */
export function reportSummary(summary: FeedbackMemorySummary, options: { verbose?: boolean; width?: number }): string {
  if (summary.projects.length === 0) {
    return 'No feedback memories found.';
  }
  const width = options.width ?? FALLBACK_WIDTH;
  const body = options.verbose ? verboseBody(summary.projects, width) : tableBody(summary.projects);
  return `${body}\n\n${totalLine(summary)}`;
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

/** Truncates text to `max` display columns, replacing the tail with an ellipsis; yields empty text when max is not positive. */
function truncate(text: string, max: number): string {
  if (max <= 0) {
    return '';
  }
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Returns the singular or plural word for a count. */
function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

// endregion | Helpers
