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

/** Renders the `--json` payload: store identity, summary counts, and the raw findings. */
export function formatJson(input: { store: StoreRef; summary: CheckSummary; findings: readonly Finding[] }): string {
  return `${JSON.stringify({ store: input.store, summary: input.summary, findings: input.findings }, null, 2)}\n`;
}

/**
 * Renders the default human output. Findings are grouped by file in path order, each line reading
 * `<severity> <rule> (line N): message`. A clean run (notes checked, no findings) prints `✓ no findings (N notes
 * checked)`; a zero-match run (no notes enumerated) prints `no notes matched <targets> (0 checked)` without the `✓`,
 * since no check was actually performed.
 */
export function formatHuman(input: {
  summary: CheckSummary;
  findings: readonly Finding[];
  targets: readonly string[];
}): string {
  const { summary, findings, targets } = input;

  if (summary.notes === 0) {
    return `no notes matched ${targets.join(', ')} (0 checked)\n`;
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

// endregion | Helpers
