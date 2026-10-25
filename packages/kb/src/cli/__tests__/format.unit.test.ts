import { describe, expect, it } from 'vitest';

import type { Finding } from '../../types.ts';
import { formatHuman, summarize } from '../format.ts';

describe('formatHuman', () => {
  it('lists files in path order whatever order the rules reported them in', () => {
    const findings = [
      buildFinding({ path: 'content/b.md', rule: 'first.rule' }),
      buildFinding({ path: 'content/a.md', rule: 'first.rule' }),
      buildFinding({ path: '.kb/taxonomy.yaml', rule: 'second.rule' }),
      buildFinding({ path: 'content/a.md', rule: 'second.rule' }),
    ];

    expect(readPathLines(render(findings))).toEqual(['.kb/taxonomy.yaml', 'content/a.md', 'content/b.md']);
  });

  it("lists a file's findings in line order, unlined first, and keeps input order for ties", () => {
    const findings = [
      buildFinding({ rule: 'late.rule', line: 9 }),
      buildFinding({ rule: 'early.rule', line: 2 }),
      buildFinding({ rule: 'file.rule' }),
      buildFinding({ rule: 'tie.first', line: 5 }),
      buildFinding({ rule: 'tie.second', line: 5 }),
    ];

    expect(readFindingRules(render(findings))).toEqual([
      'file.rule',
      'early.rule',
      'tie.first',
      'tie.second',
      'late.rule',
    ]);
  });
});

// region | Helpers

/** Builds a warning finding on `content/note.md`, overridden by `fields`. */
function buildFinding(fields: Partial<Finding> & Pick<Finding, 'rule'>): Finding {
  return { path: 'content/note.md', severity: 'warning', message: 'message', ...fields };
}

/** Reads the rule code from each indented finding line of a report. */
function readFindingRules(report: string): string[] {
  return report
    .split('\n')
    .filter((line) => line.startsWith('  '))
    .map((line) => line.trim().split(/[ :]/, 2)[1] ?? '');
}

/** Reads the file heading lines of a report, which are the unindented lines before the summary. */
function readPathLines(report: string): string[] {
  const lines = report.split('\n');
  return lines.slice(0, lines.indexOf('')).filter((line) => !line.startsWith('  '));
}

/** Renders a whole-vault report of `findings` over one note in the plain style. */
function render(findings: readonly Finding[]): string {
  return formatHuman({ summary: summarize(findings, 1), findings, targets: [], scope: 'vault', style: 'plain' });
}

// endregion | Helpers
