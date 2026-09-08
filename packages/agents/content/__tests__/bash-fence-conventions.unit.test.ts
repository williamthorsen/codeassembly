import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// A sandbox `excludedCommands` pattern is matched against a top-level segment of the command as written, from that
// segment's start. `url=$(gh pr create …)` leads with an assignment, so a `gh *` entry does not reach the `gh` inside
// it: the call runs contained, its TLS verification is denied, and it fails as
// `tls: failed to verify certificate: x509: OSStatus -26276`, which names a certificate rather than the boundary.
// Agent-facing content must therefore invoke these commands as their own segment and read the result from the
// command's output.
//
// Listed explicitly rather than discovered, mirroring the known-scripts list in `script-invocation-conventions`.
// These are the commands the machine excludes; a further entry is a one-line change here.
const EXCLUDED_COMMANDS: ReadonlyArray<string> = ['codeassembly', 'gh'];

// `_partials` holds content the expander inlines into skills and subagents at install time, so a fence there reaches
// the same place as one written in the skill itself.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;
const SCANNED_DIRS: ReadonlyArray<string> = ['_partials', 'skills', 'subagents'];

// Only fenced bash is scanned. Prose names these commands in backticks constantly (`gh pr create`), which the
// backtick-substitution form would otherwise flag in nearly every file.
//
// A fence's delimiter is a run of three or more backticks, and it closes on a run at least as long carrying no info
// string. Tracking the run's length is what keeps a longer fence that wraps shorter ones from inverting the state:
// an inverted tracker reads the next real bash opener as a close and silently stops scanning the rest of the file.
const FENCE = /^\s*(`{3,})(.*)$/;

// The two substitution openings, each followed by optional whitespace and then the command name. A command that
// appears further inside a substitution rather than at its opening is not matched; the shapes content actually
// carries are `name=$(cmd …)` and its backtick equivalent.
const SUBSTITUTION_OPENINGS: ReadonlyArray<string> = ['$(', '`'];

interface FenceLine {
  readonly line: number;
  readonly text: string;
}

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

describe('excluded-command invocation conventions', () => {
  it('no bash fence wraps an excluded command in a command substitution', async () => {
    const violations = await findViolations();
    expect(violations, formatViolations(violations)).toEqual([]);
  });

  describe('classifier', () => {
    it('flags an assignment capture', () => {
      expect(containsExcludedSubstitution('url=$(gh pr create --title x)')).toBe(true);
    });

    it('flags a backtick capture', () => {
      expect(containsExcludedSubstitution('url=`gh issue create`')).toBe(true);
    });

    it('flags a capture of the other excluded command', () => {
      expect(containsExcludedSubstitution('out=$(codeassembly status)')).toBe(true);
    });

    it('flags a capture written with whitespace after the opening', () => {
      expect(containsExcludedSubstitution('url=$( gh pr create )')).toBe(true);
    });

    it('does not flag a bare invocation', () => {
      expect(containsExcludedSubstitution('gh pr create --title x')).toBe(false);
    });

    it('does not flag a capture of an unexcluded command', () => {
      expect(containsExcludedSubstitution('output=$(acli jira workitem create --json)')).toBe(false);
    });

    it('does not flag a command whose name merely starts with an excluded one', () => {
      expect(containsExcludedSubstitution('out=$(ghostscript --version)')).toBe(false);
    });
  });

  describe('fence tracker', () => {
    it('collects a bash fence body and nothing around it', () => {
      const content = ['prose', '```bash', 'gh pr view', '```', 'more prose'].join('\n');
      expect(listBashFenceLines(content)).toEqual([{ line: 3, text: 'gh pr view' }]);
    });

    it('collects a bash fence indented inside a list item', () => {
      const content = ['- item', '', '  ```bash', '  gh pr view', '  ```'].join('\n');
      expect(listBashFenceLines(content)).toEqual([{ line: 4, text: '  gh pr view' }]);
    });

    it('ignores a shorter fence run nested inside a longer one', () => {
      const content = ['````markdown', '```', 'inner', '```', '````'].join('\n');
      expect(listBashFenceLines(content)).toEqual([]);
    });

    it('still scans a bash fence following an unbalanced nested run', () => {
      const content = ['````markdown', '```bash', '````', '```bash', 'url=$(gh pr create)', '```'].join('\n');
      expect(listBashFenceLines(content)).toEqual([{ line: 5, text: 'url=$(gh pr create)' }]);
    });

    it('does not treat a fence with an info string as a close', () => {
      const content = ['```bash', 'gh pr view', '```', '```markdown', 'prose', '```'].join('\n');
      expect(listBashFenceLines(content)).toEqual([{ line: 2, text: 'gh pr view' }]);
    });
  });
});

// region | Helpers

/** Reports whether a line opens a command substitution on an excluded command. */
function containsExcludedSubstitution(line: string): boolean {
  for (const opening of SUBSTITUTION_OPENINGS) {
    let searchFrom = 0;
    while (searchFrom <= line.length) {
      const index = line.indexOf(opening, searchFrom);
      if (index === -1) break;
      searchFrom = index + opening.length;
      const after = line.slice(searchFrom).replace(/^[ \t]+/, '');
      if (EXCLUDED_COMMANDS.some((command) => startsWithCommand(after, command))) return true;
    }
  }
  return false;
}

/** Collects every offending line across the scanned content trees, in file order. */
async function findViolations(): Promise<ReadonlyArray<Violation>> {
  const violations: Array<Violation> = [];
  const files: Array<string> = [];
  for (const dir of SCANNED_DIRS) {
    files.push(...(await listMarkdownFiles(path.join(CONTENT_ROOT, dir))));
  }
  files.sort();

  for (const file of files) {
    const fenceLines = listBashFenceLines(await readFile(file, 'utf8'));
    for (const fenceLine of fenceLines) {
      if (!containsExcludedSubstitution(fenceLine.text)) continue;
      violations.push({
        file: path.relative(CONTENT_ROOT, file),
        line: fenceLine.line,
        text: fenceLine.text.trim(),
      });
    }
  }
  return violations;
}

/** Lists the body lines of every bash fence in a Markdown document, paired with their 1-based line numbers. */
function listBashFenceLines(content: string): ReadonlyArray<FenceLine> {
  const fenceLines: Array<FenceLine> = [];
  let openDelimiter: string | undefined;
  let inBashFence = false;

  for (const [index, text] of content.split('\n').entries()) {
    const fence = text.match(FENCE);
    if (fence) {
      const delimiter = fence[1] ?? '';
      const info = (fence[2] ?? '').trim();
      if (openDelimiter === undefined) {
        openDelimiter = delimiter;
        inBashFence = info === 'bash';
        continue;
      }
      if (delimiter.length >= openDelimiter.length && info === '') {
        openDelimiter = undefined;
        inBashFence = false;
        continue;
      }
    }
    if (inBashFence) fenceLines.push({ line: index + 1, text });
  }
  return fenceLines;
}

/** Renders the assertion message: what was found, why it fails, and where. */
function formatViolations(violations: ReadonlyArray<Violation>): string {
  if (violations.length === 0) return '';
  const header =
    `Found ${violations.length} command substitution(s) wrapping a sandbox-excluded command ` +
    `(${EXCLUDED_COMMANDS.join(', ')}). A substitution takes the call back inside the sandbox, where it fails on ` +
    `TLS verification. Invoke the command as its own segment and read the result from its output.`;
  const lines = violations.map((violation) => `  ${violation.file}:${violation.line}: ${violation.text}`);
  return [header, ...lines].join('\n');
}

/** Reports whether the text opens with the command name followed by a word boundary. */
function startsWithCommand(text: string, command: string): boolean {
  if (!text.startsWith(command)) return false;
  const next = text.charAt(command.length);
  return next === '' || !/[\w-]/.test(next);
}

// endregion | Helpers
