import type { Finding } from '../types.ts';

/** A resolved store's identity, surfaced in both human and JSON output. */
export interface StoreRef {
  /** The store's display name, or `null` for a `.kb/`-discovered store with no registry entry. */
  name: string | null;
  /** Absolute path to the store root. */
  path: string;
}

/** Severity-partitioned counts over a finding set, plus the note total checked. */
export interface CheckSummary {
  /** Notes enumerated and checked. */
  notes: number;
  /** Total findings. */
  total: number;
  /** Findings with `severity: 'error'`. */
  errors: number;
  /** Findings with `severity: 'warning'`. */
  warnings: number;
}

/** Which selection produced a report, controlling the wording of the zero-match line. */
export type CheckScope = 'vault' | 'patterns' | 'vs';

/**
 * Renders the default human output. Findings are grouped by file in path order, each line reading
 * `<severity> <rule> (line N): message`. A clean run (notes checked, no findings) prints `✓ no findings (N notes
 * checked)`; a run that checked nothing prints a zero-match line worded for its `scope` — naming the config targets
 * for a whole-vault run, and a scope-appropriate line for a targeted one — without the `✓`, since no check ran.
 */
export function formatHuman(input: {
  summary: CheckSummary;
  findings: readonly Finding[];
  targets: readonly string[];
  scope: CheckScope;
}): string {
  const { summary, findings, targets, scope } = input;

  if (summary.notes === 0) {
    return `${zeroMatchLine(scope, targets)}\n`;
  }
  if (findings.length === 0) {
    return `✓ no findings (${summary.notes} notes checked)\n`;
  }

  const lines: string[] = [];
  for (const [path, group] of groupByPath(findings)) {
    lines.push(path);
    for (const finding of group) {
      const location = finding.line === undefined ? '' : ` (line ${finding.line})`;
      lines.push(`  ${finding.severity} ${finding.rule}${location}: ${finding.message}`);
    }
  }
  lines.push(
    '',
    `${summary.total} findings (${summary.errors} errors, ${summary.warnings} warnings) in ${summary.notes} notes`,
  );
  return `${lines.join('\n')}\n`;
}

/** Renders the `--json` payload: store identity, summary counts, and the raw findings. */
export function formatJson(input: { store: StoreRef; summary: CheckSummary; findings: readonly Finding[] }): string {
  return `${JSON.stringify({ store: input.store, summary: input.summary, findings: input.findings }, null, 2)}\n`;
}

/** Partitions a finding set into total, error, and warning counts over `noteCount` notes. */
export function summarize(findings: readonly Finding[], noteCount: number): CheckSummary {
  let errors = 0;
  let warnings = 0;
  for (const finding of findings) {
    if (finding.severity === 'error') errors += 1;
    else warnings += 1;
  }
  return { notes: noteCount, total: findings.length, errors, warnings };
}

// region | Helpers

/** Groups findings by their `path`, preserving each path's first-seen order and the findings' input order within it. */
function groupByPath(findings: readonly Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    let group = groups.get(finding.path);
    if (group === undefined) {
      group = [];
      groups.set(finding.path, group);
    }
    group.push(finding);
  }
  return groups;
}

/** The line for a run that checked nothing, worded for how its notes were selected. */
function zeroMatchLine(scope: CheckScope, targets: readonly string[]): string {
  switch (scope) {
    case 'patterns':
      return 'no notes matched the given paths (0 checked)';
    case 'vs':
      return 'no changed notes to check (0 checked)';
    case 'vault':
      return `no notes matched ${targets.join(', ')} (0 checked)`;
  }
}

// endregion | Helpers
