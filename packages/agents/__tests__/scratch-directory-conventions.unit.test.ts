import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// A `mktemp` call that names neither a template nor a tmpdir option (`-p`, `--tmpdir`) reads the Darwin per-user temp
// directory rather than `$TMPDIR`, and the agent sandbox denies that path. `-t` names a prefix, not a template, so it
// counts as neither. The command then exits non-zero with empty stdout, and `cd ""` returns 0, so a script carrying the
// empty value writes into the invoking directory instead.
//
// macOS substitutes only a trailing X run, so a template that continues past its run names one fixed path: The first
// invocation leaves the file behind, and the second fails on it.
//
// The scan covers the whole package because both halves of it use the command: The guidance under `content/`
// recommends it, and the shellspec helper under `spec/` runs it.
const PACKAGE_ROOT = new URL('../', import.meta.url).pathname;

/**
 * A `mktemp` call whose options reach the end of its statement without a template or a tmpdir option. The pattern
 * accepts only the options that leave the location unchosen (`-d`, `-q`, `-u`, and `-t` with its prefix), so a `-p` or
 * `--tmpdir` stops the match.
 *
 * The terminator set omits the backtick, which is what keeps prose out: A mention inside inline code is followed by
 * one, so `bare \`mktemp -d\` fails under the sandbox` reads as the warning it is rather than as a call. The lookbehind
 * keeps paths out the same way, so `chmod +x bin/mktemp` names no call.
 */
const UNTEMPLATED_MKTEMP_SOURCE = String.raw`(?<![\w./-])mktemp(?:[ \t]+(?:-[dqu]+|--(?:directory|dry-run|quiet)|-[dqu]*t[ \t]*[^\s|)<>&;\x60]+))*[ \t]*(?:$|[|)<>&;#]|\d+[<>])`;

/**
 * A `mktemp` template whose last X run is followed by more of the template, which ends at a quote, whitespace, a
 * backtick, or a statement terminator. An unquoted template closing a substitution therefore ends at the `)`.
 */
const SUFFIXED_TEMPLATE_SOURCE = String.raw`(?<![\w./-])mktemp\b[^\n|)>&;\x60]*?X{3,}[^\sX"'\x60|)>&;]+(?=["'\s\x60|)>&;]|$)`;

/** The comment that opens a negative example, exempting the lines under it up to the next blank one. */
const BAD_EXAMPLE_LABEL = /^\s*#\s*Bad\b/;

const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set(['.md', '.sh']);

/** Directories holding no authored source: build output, dependencies, and test fixtures. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['dist', 'fixtures', 'node_modules']);

describe('scratch-directory conventions', () => {
  it('names a template or a tmpdir option on every mktemp call outside a labelled negative example', async () => {
    const violations = await listPackageViolations(UNTEMPLATED_MKTEMP_SOURCE);

    const message =
      'A `mktemp` call needs a template rooted at $TMPDIR or a tmpdir option; without either it picks a path the ' +
      'agent sandbox denies. Write `mktemp -d "${TMPDIR:-/tmp}/<prefix>.XXXXXX"` or pass `-p "$TMPDIR"`, or open ' +
      'the block with `# Bad:` where the failure is the point:\n  ' +
      violations.join('\n  ');
    expect(violations, message).toEqual([]);
  });

  it('ends every mktemp template with its X run outside a labelled negative example', async () => {
    const violations = await listPackageViolations(SUFFIXED_TEMPLATE_SOURCE);

    const message =
      'macOS `mktemp` substitutes only a trailing X run, so a template that continues past it names one fixed path. ' +
      'End the template with its X run, or open the block with `# Bad:` where the failure is the point:\n  ' +
      violations.join('\n  ');
    expect(violations, message).toEqual([]);
  });

  // Every assertion above is negative, so a scan that stopped reading files would leave the suite green.
  it('reads both halves of the package', async () => {
    const files = await listScannedFiles(PACKAGE_ROOT);

    expect(files.some((file) => file.endsWith(path.join('spec', 'spec_helper.sh')))).toBe(true);
    expect(files.some((file) => file.endsWith(path.join('_partials', 'live-repo-writes.md')))).toBe(true);
  });

  it.each([
    ['a bare file call', '$(mktemp)', 1, 0],
    ['a bare directory call', 'tmpdir=$(mktemp -d)', 1, 0],
    ['a long-option directory call', 'mktemp --directory', 1, 0],
    ['a quiet file call', 'mktemp -q', 1, 0],
    ['bundled flags', 'x=$(mktemp -dq)', 1, 0],
    ['separate flags', 'x=$(mktemp -q -d) || exit', 1, 0],
    ['a prefix flag', 'mktemp -t probe', 1, 0],
    ['a bundled prefix flag', 'x=$(mktemp -dt probe)', 1, 0],
    ['a redirected prefix flag', 'mktemp -d -t probe >out', 1, 0],
    ['a call redirecting a numbered descriptor', 'dir=$(mktemp -d 2>/dev/null)', 1, 0],
    ['a call redirecting its input', 'dir=$(mktemp -d <&-)', 1, 0],
    ['a call followed by a comment', 'mktemp -d # scratch', 1, 0],
    ['a template continuing past its X run', 'x=$(mktemp "${TMPDIR:-/tmp}/x.XXXXXX.patch")', 0, 1],
    ['a templated call', 'mktemp -d "${TMPDIR:-/tmp}/probe.XXXXXX"', 0, 0],
    [
      'a templated call redirecting a numbered descriptor',
      'mktemp -d "${TMPDIR:-/tmp}/probe.XXXXXX" 2>/dev/null',
      0,
      0,
    ],
    ['a tmpdir option', 'mktemp -d -p "$TMPDIR"', 0, 0],
    ['a long tmpdir option', 'mktemp -d --tmpdir', 0, 0],
    ['a tmpdir option beside a prefix flag', 'mktemp -d -p "$TMPDIR" -t probe', 0, 0],
    ['a path to the binary', 'chmod +x bin/mktemp', 0, 0],
    ['a prose mention in inline code', 'bare `mktemp -d` picks a denied path', 0, 0],
    ['an unquoted template closing a substitution', 'x=$(mktemp -d $dir/x.XXXXXX)', 0, 0],
    ['a template with an earlier X run', 'mktemp -d "$TMPDIR/XXXprobe.XXXXXX"', 0, 0],
  ])('classifies %s', (_label, line, untemplatedCount, suffixedCount) => {
    expect(listMatches(UNTEMPLATED_MKTEMP_SOURCE, line)).toHaveLength(untemplatedCount);
    expect(listMatches(SUFFIXED_TEMPLATE_SOURCE, line)).toHaveLength(suffixedCount);
  });

  it('exempts a labelled example without exempting its neighbour', () => {
    const buildFence = (goodCall: string): string =>
      [
        '```bash',
        '# Bad: the bare call fails under an agent sandbox',
        'tmpdir=$(mktemp -d)',
        '',
        '# Good: the template resolves everywhere',
        goodCall,
        '```',
      ].join('\n');

    const templated = buildFence('tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/probe.XXXXXX")');
    const regressed = buildFence('tmpdir=$(mktemp -d)');

    expect(listMatches(UNTEMPLATED_MKTEMP_SOURCE, listScannableText(templated, 'x.md'))).toEqual([]);
    expect(listMatches(UNTEMPLATED_MKTEMP_SOURCE, listScannableText(regressed, 'x.md'))).toHaveLength(1);
  });

  it('exempts nothing in a shell file', () => {
    const script = '# Bad: this label scopes to no block here\ntmpdir=$(mktemp -d)\n';

    expect(listMatches(UNTEMPLATED_MKTEMP_SOURCE, listScannableText(script, 'x.sh'))).toHaveLength(1);
  });
});

// region | Helpers

/**
 * Lists the matches of a pattern source in a span of text, each trimmed to the text that matched. The regex is compiled
 * per call because a shared global regex carries `lastIndex` between uses, which would let one assertion decide another.
 */
function listMatches(source: string, text: string): ReadonlyArray<string> {
  return text
    .matchAll(new RegExp(source, 'gm'))
    .map((match) => match[0].trim())
    .toArray();
}

/** Lists the matches of a pattern source across the package's scanned files, each prefixed with its file's path. */
async function listPackageViolations(source: string): Promise<ReadonlyArray<string>> {
  const violations: Array<string> = [];
  const files = await listScannedFiles(PACKAGE_ROOT);

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const relativePath = path.relative(PACKAGE_ROOT, file);
    const matches = listMatches(source, listScannableText(content, file));

    for (const match of matches) {
      violations.push(`${relativePath} -> ${match}`);
    }
  }

  return violations;
}

/**
 * Returns a file's text with each labelled negative example removed. The label exempts the lines from itself to the
 * next blank one, so a fence pairing a `# Bad` block with a `# Good` one keeps the second under the scan. Only a
 * fenced block is eligible: At the top level of a Markdown file the same text is an `h1`, and a shell file has no
 * fence to scope the label to, so it takes no exemption at all.
 */
function listScannableText(content: string, file: string): string {
  if (!file.endsWith('.md')) return content;

  const kept: Array<string> = [];
  let isInsideFence = false;
  let isSkipping = false;

  for (const line of content.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      isInsideFence = !isInsideFence;
      isSkipping = false;
    } else if (isInsideFence && BAD_EXAMPLE_LABEL.test(line)) {
      isSkipping = true;
      continue;
    } else if (isSkipping) {
      if (line.trim() === '') isSkipping = false;
      continue;
    }
    kept.push(line);
  }

  return kept.join('\n');
}

/** Lists the Markdown and shell files under a root whose scratch-directory usage this suite governs. */
async function listScannedFiles(root: string): Promise<ReadonlyArray<string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && SCANNED_EXTENSIONS.has(path.extname(entry.name)))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) =>
      path
        .relative(root, file)
        .split(path.sep)
        .every((segment) => !SKIPPED_DIRECTORIES.has(segment)),
    );
}

// endregion | Helpers
