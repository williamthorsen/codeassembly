import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// Two conventions bind the bash fences in agent-facing content, and both exist because a Bash invocation is the whole
// world a fence gets: nothing it assigns survives to the next call, and only what it prints reaches the agent.
//
// A sandbox `excludedCommands` pattern is matched against a top-level segment of the command as written, from that
// segment's start. `url=$(gh pr create …)` leads with an assignment, so a `gh *` entry does not reach the `gh` inside
// it: the call runs contained, its TLS verification is denied, and it fails as
// `tls: failed to verify certificate: x509: OSStatus -26276`, which names a certificate rather than the boundary.
//
// A fence whose last statement is an assignment prints nothing at all, so prose directing the agent to read a value
// from the command's output has nothing to read. The repair is to let the terminal command print.
//
// Listed explicitly rather than discovered, mirroring the known-scripts list in `script-invocation-conventions`.
// These are the commands the machine excludes; a further entry is a one-line change here.
const EXCLUDED_COMMANDS: ReadonlyArray<string> = ['codeassembly', 'gh'];

// `_partials` holds content the expander inlines into skills and subagents at install time, so a fence there reaches
// the same place as one written in the skill itself.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;
const SCANNED_DIRS: ReadonlyArray<string> = ['_partials', 'skills', 'subagents'];

// A fence's delimiter is a run of three or more backticks, and it closes on a run at least as long carrying no info
// string. Tracking the run's length is what keeps a longer fence that wraps shorter ones from inverting the state:
// an inverted tracker reads the next real bash opener as a close and silently stops scanning the rest of the file.
//
// Only fenced bash is scanned. Prose names these commands in backticks constantly (`gh pr create`), which the
// backtick-substitution form would otherwise flag in nearly every file.
const FENCE = /^\s*(`{3,})(.*)$/;

const ASSIGNMENT = /^\s*\w+\+?=/;

// The two substitution openings, each followed by optional whitespace and then the command name. A command that
// appears further inside a substitution rather than at its opening is not matched; the shapes content actually
// carries are `name=$(cmd …)` and its backtick equivalent.
const SUBSTITUTION_OPENINGS: ReadonlyArray<string> = ['$(', '`'];

interface FenceLine {
  readonly line: number;
  readonly text: string;
}

interface TerminalStatement {
  readonly command: string;
  readonly start: FenceLine;
}

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

describe('bash-fence conventions', () => {
  it('no bash fence wraps an excluded command in a command substitution', async () => {
    const violations = await findViolations((fence) =>
      fence.filter((fenceLine) => containsExcludedSubstitution(fenceLine.text)),
    );
    const message =
      `Found ${violations.length} command substitution(s) wrapping a sandbox-excluded command ` +
      `(${EXCLUDED_COMMANDS.join(', ')}). A substitution takes the call back inside the sandbox, where it fails on ` +
      `TLS verification. Invoke the command as its own segment and read the result from its output.`;
    expect(violations, formatViolations(violations, message)).toEqual([]);
  });

  it('no bash fence ends on an assignment', async () => {
    const violations = await findViolations((fence) => {
      const terminal = findTerminalStatement(fence);
      return terminal && ASSIGNMENT.test(terminal.command) ? [terminal.start] : [];
    });
    const message =
      `Found ${violations.length} bash fence(s) whose last statement is an assignment. An assignment prints ` +
      `nothing, and no shell variable survives the invocation, so the value never reaches the agent. Let the ` +
      `terminal command print instead.`;
    expect(violations, formatViolations(violations, message)).toEqual([]);
  });

  describe('substitution classifier', () => {
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
      expect(listBashFences(content).flat()).toEqual([{ line: 3, text: 'gh pr view' }]);
    });

    it('collects a bash fence indented inside a list item', () => {
      const content = ['- item', '', '  ```bash', '  gh pr view', '  ```'].join('\n');
      expect(listBashFences(content).flat()).toEqual([{ line: 4, text: '  gh pr view' }]);
    });

    it('ignores a shorter fence run nested inside a longer one', () => {
      const content = ['````markdown', '```', 'inner', '```', '````'].join('\n');
      expect(listBashFences(content).flat()).toEqual([]);
    });

    it('still scans a bash fence following an unbalanced nested run', () => {
      const content = ['````markdown', '```bash', '````', '```bash', 'url=$(gh pr create)', '```'].join('\n');
      expect(listBashFences(content).flat()).toEqual([{ line: 5, text: 'url=$(gh pr create)' }]);
    });

    it('does not treat a fence with an info string as a close', () => {
      const content = ['```bash', 'gh pr view', '```', '```markdown', 'prose', '```'].join('\n');
      expect(listBashFences(content).flat()).toEqual([{ line: 2, text: 'gh pr view' }]);
    });

    it('keeps each fence separate', () => {
      const content = ['```bash', 'one', '```', 'prose', '```bash', 'two', '```'].join('\n');
      expect(listBashFences(content)).toHaveLength(2);
    });
  });

  describe('terminal-statement finder', () => {
    it('finds the last statement', () => {
      const fence = [
        { line: 1, text: 'gh pr view' },
        { line: 2, text: 'url=$(echo x)' },
      ];
      expect(findTerminalStatement(fence)?.start.line).toBe(2);
    });

    it('skips trailing blank lines and comments', () => {
      const fence = [
        { line: 1, text: 'json=$(render)' },
        { line: 2, text: '# a note' },
        { line: 3, text: ' '.repeat(3) },
      ];
      expect(findTerminalStatement(fence)?.start.line).toBe(1);
    });

    it('reports a continued statement at the line that starts it', () => {
      const fence = [
        { line: 1, text: 'json=$(render \\' },
        { line: 2, text: '  --flag value)' },
      ];
      const terminal = findTerminalStatement(fence);
      expect(terminal?.start.line).toBe(1);
      expect(ASSIGNMENT.test(terminal?.command ?? '')).toBe(true);
    });

    it('takes the last command of a semicolon-joined chain', () => {
      const fence = [
        { line: 1, text: 'BRANCH=$(git branch --show-current); \\' },
        { line: 2, text: 'git branch -D "$BRANCH"' },
      ];
      const terminal = findTerminalStatement(fence);
      expect(terminal?.start.line).toBe(1);
      expect(ASSIGNMENT.test(terminal?.command ?? '')).toBe(false);
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

/**
 * Finds a fence's last statement: the line that starts it, and the last `;`-separated command within it. Blank lines
 * and comments are skipped, and backslash continuations are joined, so a chain written as one invocation reports the
 * command it actually ends on.
 */
function findTerminalStatement(fence: ReadonlyArray<FenceLine>): TerminalStatement | undefined {
  const statements = fence.filter((fenceLine) => fenceLine.text.trimStart() && !isComment(fenceLine.text));
  let startIndex: number | undefined;
  for (const index of statements.keys()) {
    const previous = index === 0 ? undefined : statements[index - 1];
    if (previous === undefined || !previous.text.trimEnd().endsWith('\\')) startIndex = index;
  }
  if (startIndex === undefined) return undefined;

  const start = statements[startIndex];
  if (start === undefined) return undefined;
  const joined = statements
    .slice(startIndex)
    .map((fenceLine) => fenceLine.text.trimEnd().replace(/\\$/, ''))
    .join(' ');
  const command = joined.split(';').findLast((segment) => segment.trim()) ?? joined;
  return { command, start };
}

/** Collects every line the selector reports as offending, across the scanned content trees, in file order. */
async function findViolations(
  select: (fence: ReadonlyArray<FenceLine>) => ReadonlyArray<FenceLine>,
): Promise<ReadonlyArray<Violation>> {
  const violations: Array<Violation> = [];
  const files: Array<string> = [];
  for (const dir of SCANNED_DIRS) {
    files.push(...(await listMarkdownFiles(path.join(CONTENT_ROOT, dir))));
  }
  files.sort();

  for (const file of files) {
    const fences = listBashFences(await readFile(file, 'utf8'));
    for (const fence of fences) {
      for (const fenceLine of select(fence)) {
        violations.push({
          file: path.relative(CONTENT_ROOT, file),
          line: fenceLine.line,
          text: fenceLine.text.trim(),
        });
      }
    }
  }
  return violations;
}

/** Renders the assertion message: the stated reason, then each offending site. */
function formatViolations(violations: ReadonlyArray<Violation>, header: string): string {
  if (violations.length === 0) return '';
  const lines = violations.map((violation) => `  ${violation.file}:${violation.line}: ${violation.text}`);
  return [header, ...lines].join('\n');
}

/** Reports whether a fence line is a shell comment. */
function isComment(text: string): boolean {
  return text.trimStart().startsWith('#');
}

/** Groups the body lines of each bash fence in a Markdown document, paired with their 1-based line numbers. */
function listBashFences(content: string): ReadonlyArray<ReadonlyArray<FenceLine>> {
  const fences: Array<Array<FenceLine>> = [];
  let openDelimiter: string | undefined;
  let current: Array<FenceLine> | undefined;

  for (const [index, text] of content.split('\n').entries()) {
    const fence = text.match(FENCE);
    if (fence) {
      const delimiter = fence[1] ?? '';
      const info = (fence[2] ?? '').trim();
      if (openDelimiter === undefined) {
        openDelimiter = delimiter;
        if (info === 'bash') {
          current = [];
          fences.push(current);
        }
        continue;
      }
      if (delimiter.length >= openDelimiter.length && info === '') {
        openDelimiter = undefined;
        current = undefined;
        continue;
      }
    }
    current?.push({ line: index + 1, text });
  }
  return fences;
}

/** Reports whether the text opens with the command name followed by a word boundary. */
function startsWithCommand(text: string, command: string): boolean {
  if (!text.startsWith(command)) return false;
  const next = text.charAt(command.length);
  return next === '' || !/[\w-]/.test(next);
}

// endregion | Helpers
