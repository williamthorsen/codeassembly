import { describe, expect, it } from 'vitest';

import { HARNESSES } from '../../../src/lib/harness.ts';
import { describeViolations, findHarnessScopedPaths, findRulebookMarkers } from '../guidance-constraints.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

describe(findHarnessScopedPaths, () => {
  it('finds a home-anchored harness path', () => {
    expect(findHarnessScopedPaths('See ~/.claude/skills/foo.md for details.')).toEqual([
      { lineNumber: 1, text: 'See ~/.claude/skills/foo.md for details.' },
    ]);
  });

  it('finds a repository-local harness path', () => {
    expect(findHarnessScopedPaths('The import lives in .claude/CLAUDE.md.')).toHaveLength(1);
  });

  it('finds a path belonging to a harness other than Claude', () => {
    expect(findHarnessScopedPaths(`Rovo reads ${ROVO_HOME}/config.yml.`)).toHaveLength(1);
  });

  it('reports the 1-based line number of each offending line', () => {
    const content = `first\n~/.claude/a\nthird\n${ROVO_HOME}/b\n`;
    expect(findHarnessScopedPaths(content).map((violation) => violation.lineNumber)).toEqual([2, 4]);
  });

  it('leaves the harness-neutral agents directory alone', () => {
    expect(
      findHarnessScopedPaths('Slug is set in .agents/preferences.yaml, mirroring ~/.agents/preferences.yaml.'),
    ).toEqual([]);
  });

  it('leaves a dotted directory that merely resembles a harness home alone', () => {
    expect(findHarnessScopedPaths('Config lives in .config/vitest/ and .github/workflows/.')).toEqual([]);
  });

  it('finds nothing in content that names no path', () => {
    expect(findHarnessScopedPaths('Run the bootstrap before anything else.')).toEqual([]);
  });

  // The detection pattern restates the home directories the canonical harness table holds, so that a compiled kit
  // carries two string literals instead of the table's filesystem imports. This pin is what makes the duplication
  // safe: a harness added to the table fails here until the pattern covers it.
  it('fires for every home directory the canonical harness table names', () => {
    const homeDirs = Object.values(HARNESSES).map((harness) => harness.homeDir);
    const undetected = homeDirs.filter(
      (homeDir) =>
        findHarnessScopedPaths(`See ~/${homeDir}/skills/foo.md.`).length === 0 ||
        findHarnessScopedPaths(`See ${homeDir}/skills/foo.md.`).length === 0,
    );
    expect(undetected).toEqual([]);
  });
});

describe(findRulebookMarkers, () => {
  it('finds an opening marker', () => {
    expect(findRulebookMarkers('<!-- rulebook:williamthorsen-writing-preferences -->')).toHaveLength(1);
  });

  it('finds a closing marker', () => {
    expect(findRulebookMarkers('<!-- /rulebook:williamthorsen-writing-preferences -->')).toHaveLength(1);
  });

  // An unpaired opener is what `sync`'s retirement sweep misses: it matches complete open/close pairs, so a lone
  // marker survives every run and this check is the only thing that reports it.
  it('finds an unpaired opening marker', () => {
    const content = '# Guidance\n\n<!-- rulebook:orphaned -->\n\nProse that no closing marker follows.\n';
    expect(findRulebookMarkers(content)).toEqual([{ lineNumber: 3, text: '<!-- rulebook:orphaned -->' }]);
  });

  it('finds a marker written with irregular spacing', () => {
    expect(findRulebookMarkers('<!--rulebook:tight-->')).toHaveLength(1);
  });

  it('leaves a comment that merely mentions rulebooks alone', () => {
    expect(findRulebookMarkers('<!-- rulebooks are installed by sync -->')).toEqual([]);
  });

  it('finds nothing in content carrying no comment', () => {
    expect(findRulebookMarkers('## Gotchas\n\nThe cache is keyed on inputs alone.\n')).toEqual([]);
  });
});

describe(describeViolations, () => {
  it('names each offending line by number and trimmed text', () => {
    const violations = [
      { lineNumber: 3, text: '  ~/.claude/skills/foo.md  ' },
      { lineNumber: 9, text: '<!-- rulebook:x -->' },
    ];
    expect(describeViolations(violations)).toBe('line 3: ~/.claude/skills/foo.md; line 9: <!-- rulebook:x -->');
  });

  it('renders no violations as an empty string', () => {
    expect(describeViolations([])).toBe('');
  });
});
