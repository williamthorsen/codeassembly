import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// Three conventions bind the Bash invocations in agent-facing content, and all three exist because one invocation is
// the whole world a call gets: nothing it assigns survives to the next call, and only what it prints reaches the agent.
//
// A sandbox `excludedCommands` pattern is matched against a top-level segment of the command as written, from that
// segment's start. `url=$(gh pr create …)` leads with an assignment, so a `gh *` entry does not reach the `gh` inside
// it: the call runs contained, its TLS verification is denied, and it fails as
// `tls: failed to verify certificate: x509: OSStatus -26276`, which names a certificate rather than the boundary.
//
// A fence whose last statement is an assignment prints nothing at all, so prose directing the agent to read a value
// from the command's output has nothing to read. The repair is to let the terminal command print.
//
// A variable an invocation reads but does not assign expands to nothing, however carefully the prose above the call
// establishes the name. An agent-supplied value takes a brace placeholder that the agent substitutes as literal text.
//
// Listed explicitly rather than discovered, mirroring the known-scripts list in `script-invocation-conventions`.
// These are the commands the machine excludes; a further entry is a one-line change here.
const EXCLUDED_COMMANDS: ReadonlyArray<string> = ['codeassembly', 'gh'];

// The shell supplies these, so reading one is not a defect. A variable falling out of use is not a defect either, so
// the set carries no stale-entry check. Positional and special parameters need no entry: `$1`, and awk's `$4` inside
// a quoted program, fall outside the identifier shape `VARIABLE_READ` matches.
const ALLOWED_VARIABLES: ReadonlySet<string> = new Set(['HOME', 'PWD', 'TMPDIR', 'USER']);

// Content the corpus does not author is out of every rule's reach here: the extract is marked do-not-edit, so a
// violation in one has no available repair. `banned-codepoints` exempts the same files by path and pairs them with a
// stale-entry check; the marker is the predicate those paths stand for, so reading it needs neither.
const EXTRACTION_MARKER = '<!-- Extracted verbatim from the superpowers plugin. Do not edit. -->';

// An inline code span is one Bash call by construction, so a read in it is unassigned unless the span assigns it. Only
// a span opening with a command is scanned: prose names these variables in backticks constantly (`$MODEL_ID`), and a
// flag fragment (`--body-file "$body_path"`) quotes part of a fence rather than making a call of its own. Listed
// explicitly, as `EXCLUDED_COMMANDS` is; a further entry is a one-line change here.
const INVOCATION_OPENINGS: ReadonlyArray<string> = ['git ', 'node ', '{harness_home_dir}'];

// `_partials` holds content the expander inlines into skills and subagents at install time, so a fence there reaches
// the same place as one written in the skill itself.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;
const SCANNED_DIRS: ReadonlyArray<string> = ['_partials', 'skills', 'subagents'];

// A fence's delimiter is a run of three or more backticks, and it closes on a run at least as long carrying no info
// string. Tracking the run's length is what keeps a longer fence that wraps shorter ones from inverting the state:
// an inverted tracker reads the next real bash opener as a close and silently stops scanning the rest of the file.
//
// The substitution and terminal-assignment checks read fenced bash alone. Prose names these commands in backticks
// constantly (`gh pr create`), which the backtick-substitution form would otherwise flag in nearly every file.
const FENCE = /^\s*(`{3,})(.*)$/;

const ASSIGNMENT = /^\s*\w+\+?=/;

// The three forms that bind a name within one invocation. `ASSIGNMENT_TARGET` needs the `m` flag: anchored to the
// joined body alone, it reads an assignment indented inside a list item as no assignment at all.
const ASSIGNMENT_TARGET =
  /(?:^|[;&|(]|\bdo\b|\belse\b|\bthen\b)\s*(?:declare\s+|export\s+|local\s+|readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)\+?=/gm;
const LOOP_TARGET = /\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/gm;
const READ_TARGET = /\bread\s+(?:-r\s+)?([A-Za-z_][A-Za-z0-9_]*)/gm;

// A read of a named variable. `$(cmd)` opens a command substitution rather than a name, so it does not match.
const VARIABLE_READ = /\$\{?([A-Za-z_][A-Za-z0-9_]*)/g;

// A single-backtick code span carrying no newline, and not part of a longer backtick run.
const INLINE_SPAN = /(?<!`)`([^`\n]+)`(?!`)/g;

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

describe('bash-invocation conventions', () => {
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

  it('no bash invocation reads a variable it does not assign', async () => {
    const violations = [...(await findViolations(findUnassignedReads)), ...(await findInlineViolations())].toSorted(
      (left, right) => left.file.localeCompare(right.file) || left.line - right.line,
    );
    const message =
      `Found ${violations.length} Bash invocation(s) reading a variable that the same invocation does not assign. ` +
      `No shell state survives an invocation, so the read expands to nothing however carefully the prose above ` +
      `establishes the name. Write the value in as a brace placeholder the agent substitutes as literal text, or ` +
      `assign the variable inside the invocation where it genuinely runs as written.`;
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

  describe('unassigned-read finder', () => {
    it('flags a read no line assigns', () => {
      const fence = [{ line: 1, text: '--model "$MODEL_ID"' }];
      expect(findUnassignedReads(fence)).toEqual([{ line: 1, text: '--model "$MODEL_ID"' }]);
    });

    it('does not flag a read the fence assigns', () => {
      const fence = [
        { line: 1, text: 'body_path="/tmp/x.md"' },
        { line: 2, text: 'gh issue edit 1 --body-file "$body_path"' },
      ];
      expect(findUnassignedReads(fence)).toEqual([]);
    });

    it('does not flag a read assigned on an indented line', () => {
      const fence = [
        { line: 1, text: '  output=$(acli jira workitem create --json)' },
        { line: 2, text: '  printf \'%s\' "$output"' },
      ];
      expect(findUnassignedReads(fence)).toEqual([]);
    });

    it('does not flag a loop or read target', () => {
      const fence = [
        { line: 1, text: 'for file in *.md; do' },
        { line: 2, text: '  read -r first < "$file"' },
        { line: 3, text: '  echo "$first"' },
        { line: 4, text: 'done' },
      ];
      expect(findUnassignedReads(fence)).toEqual([]);
    });

    it('does not flag an allowed environment variable', () => {
      expect(findUnassignedReads([{ line: 1, text: 'cd "$TMPDIR"' }])).toEqual([]);
    });

    it('does not flag a command substitution', () => {
      expect(findUnassignedReads([{ line: 1, text: 'echo "$(git branch --show-current)"' }])).toEqual([]);
    });

    it('does not flag a positional parameter', () => {
      expect(findUnassignedReads([{ line: 1, text: 'echo "$1"' }])).toEqual([]);
    });

    it('does not flag a comment', () => {
      expect(findUnassignedReads([{ line: 1, text: '# reads $MODEL_ID from the environment block' }])).toEqual([]);
    });
  });

  describe('inline-invocation classifier', () => {
    it('flags a span opening with a command', () => {
      const content = 'Run `{harness_home_dir}/scripts/resolve.sh --model "$MODEL_ID"` via Bash.';
      expect(listInlineViolations(content)).toEqual([
        { line: 1, text: '{harness_home_dir}/scripts/resolve.sh --model "$MODEL_ID"' },
      ]);
    });

    it('does not flag a span that merely names the variable', () => {
      expect(listInlineViolations('Source `$MODEL_ID` from the environment block.')).toEqual([]);
    });

    it('does not flag a flag fragment quoting a fence variable', () => {
      expect(listInlineViolations('Pass `--body-file "$body_path"` to the call.')).toEqual([]);
    });

    it('does not flag a span opening with an unlisted command', () => {
      expect(listInlineViolations('Avoid `echo "$BODY"`, which needs escaping.')).toEqual([]);
    });

    it('does not flag a span whose own assignment binds the read', () => {
      expect(listInlineViolations('Run `node x.mjs --set-url "{url}"` first.')).toEqual([]);
    });

    it('does not read inside a fenced block', () => {
      const content = ['```bash', 'git diff "$default_branch"', '```'].join('\n');
      expect(listInlineViolations(content)).toEqual([]);
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

/** Collects every inline invocation span reading a variable it does not assign, across the scanned trees. */
async function findInlineViolations(): Promise<ReadonlyArray<Violation>> {
  const violations: Array<Violation> = [];
  const files = await listScannedFiles();
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (isExtractedContent(content)) continue;
    for (const span of listInlineViolations(content)) {
      violations.push({ file: path.relative(CONTENT_ROOT, file), line: span.line, text: span.text });
    }
  }
  return violations;
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

/** Collects every line of a fence that reads a variable the fence does not assign. */
function findUnassignedReads(fence: ReadonlyArray<FenceLine>): ReadonlyArray<FenceLine> {
  const assigned = listAssignedVariables(fence.map((fenceLine) => fenceLine.text).join('\n'));
  return fence.filter(
    (fenceLine) => !isComment(fenceLine.text) && listUnassignedReads(fenceLine.text, assigned).length > 0,
  );
}

/** Collects every line the selector reports as offending, across the scanned content trees, in file order. */
async function findViolations(
  select: (fence: ReadonlyArray<FenceLine>) => ReadonlyArray<FenceLine>,
): Promise<ReadonlyArray<Violation>> {
  const violations: Array<Violation> = [];
  const files = await listScannedFiles();
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (isExtractedContent(content)) continue;
    for (const fence of listBashFences(content)) {
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

/** Reports whether a document is a verbatim extract, which the corpus does not author and cannot repair. */
function isExtractedContent(content: string): boolean {
  return content.includes(EXTRACTION_MARKER);
}

/** Collects the variable names that one invocation binds, by assignment, loop target, or `read` target. */
function listAssignedVariables(body: string): ReadonlySet<string> {
  const assigned = new Set<string>();
  for (const pattern of [ASSIGNMENT_TARGET, LOOP_TARGET, READ_TARGET]) {
    for (const match of body.matchAll(pattern)) {
      if (match[1] !== undefined) assigned.add(match[1]);
    }
  }
  return assigned;
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

/**
 * Collects the inline code spans of a document that open with a command and read a variable they do not assign.
 * Fenced regions are skipped, so a fence's own lines reach only the fence checks.
 */
function listInlineViolations(content: string): ReadonlyArray<FenceLine> {
  const violations: Array<FenceLine> = [];
  let openDelimiter: string | undefined;

  for (const [index, text] of content.split('\n').entries()) {
    const fence = text.match(FENCE);
    if (fence) {
      const delimiter = fence[1] ?? '';
      if (openDelimiter === undefined) {
        openDelimiter = delimiter;
        continue;
      }
      const info = (fence[2] ?? '').trim();
      if (delimiter.length >= openDelimiter.length && info === '') openDelimiter = undefined;
      continue;
    }
    if (openDelimiter !== undefined) continue;

    for (const match of text.matchAll(INLINE_SPAN)) {
      const span = match[1];
      if (span === undefined || !opensWithInvocation(span)) continue;
      if (listUnassignedReads(span, listAssignedVariables(span)).length > 0) {
        violations.push({ line: index + 1, text: span });
      }
    }
  }
  return violations;
}

/** Lists every Markdown file under the scanned content trees, in path order. */
async function listScannedFiles(): Promise<ReadonlyArray<string>> {
  const files: Array<string> = [];
  for (const dir of SCANNED_DIRS) {
    files.push(...(await listMarkdownFiles(path.join(CONTENT_ROOT, dir))));
  }
  return files.toSorted();
}

/** Collects the variable names a line reads that neither the invocation binds nor the shell supplies. */
function listUnassignedReads(text: string, assigned: ReadonlySet<string>): ReadonlyArray<string> {
  const names: Array<string> = [];
  for (const match of text.matchAll(VARIABLE_READ)) {
    const name = match[1];
    if (name === undefined || assigned.has(name) || ALLOWED_VARIABLES.has(name)) continue;
    names.push(name);
  }
  return names;
}

/** Reports whether an inline span opens with one of the commands that make it an invocation rather than prose. */
function opensWithInvocation(span: string): boolean {
  return INVOCATION_OPENINGS.some((opening) => span.startsWith(opening));
}

/** Reports whether the text opens with the command name followed by a word boundary. */
function startsWithCommand(text: string, command: string): boolean {
  if (!text.startsWith(command)) return false;
  const next = text.charAt(command.length);
  return next === '' || !/[\w-]/.test(next);
}

// endregion | Helpers
