import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Bare `mktemp -d` reads the Darwin per-user temp directory rather than `$TMPDIR`, and the agent sandbox denies that
// path. The command then exits non-zero with empty stdout, and `cd ""` returns 0, so a script carrying the empty value
// writes into the invoking directory instead. That failure took out 139 shellspec examples and, in a consuming repo,
// routed verification writes into a working tree. `-t` resolves the same directory, so it fails the same way.
//
// The scan covers the whole package because the defect appeared in both halves of it: in the guidance under `content/`
// that recommends the command, and in the shellspec helper under `spec/` that runs it.
const PACKAGE_ROOT = new URL('../', import.meta.url).pathname;

/**
 * A `mktemp` directory call reaching the end of its statement with no template operand, `-t` included since it names a
 * prefix rather than a path. Held as a source string because a shared global regex carries `lastIndex` between uses,
 * which would let one assertion decide another.
 *
 * The terminator set omits the backtick, which is what keeps prose out: a mention inside inline code is followed by
 * one, so `bare \`mktemp -d\` fails under the sandbox` reads as the warning it is rather than as a call.
 */
const BARE_MKTEMP_SOURCE = String.raw`mktemp\s+(?:-d|--directory)(?:\s+-t\s+\S+)?\s*(?:$|[|)>&;])`;

/** The comment that opens a negative example, exempting the lines under it up to the next blank one. */
const BAD_EXAMPLE_LABEL = /^\s*#\s*Bad\b/;

const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set(['.md', '.sh']);

/** Directories holding no authored source: build output, dependencies, and test fixtures. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['dist', 'fixtures', 'node_modules']);

describe('scratch-directory conventions', () => {
  it('names a template on every mktemp call outside a labelled negative example', async () => {
    const violations: Array<string> = [];
    const files = await listScannedFiles(PACKAGE_ROOT);

    for (const file of files) {
      const content = await readFile(file, 'utf8');
      const relativePath = path.relative(PACKAGE_ROOT, file);

      const calls = listBareCalls(listScannableText(content, file));

      for (const call of calls) {
        violations.push(`${relativePath} -> ${call}`);
      }
    }

    const message =
      'A `mktemp` directory call needs a template rooted at $TMPDIR; without one it picks a path the agent sandbox ' +
      'denies. Write `mktemp -d "${TMPDIR:-/tmp}/<prefix>.XXXXXX"`, or open the block with `# Bad:` where the ' +
      'failure is the point:\n  ' +
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
    ['bare', 'tmpdir=$(mktemp -d)', 1],
    ['long-option bare', 'mktemp --directory', 1],
    ['prefix flag', 'mktemp -d -t probe', 1],
    ['templated', 'mktemp -d "${TMPDIR:-/tmp}/probe.XXXXXX"', 0],
    ['prose mention in inline code', 'bare `mktemp -d` picks a denied path', 0],
  ])('counts a %s call', (_label, line, expected) => {
    expect(listBareCalls(line)).toHaveLength(expected);
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

    expect(listBareCalls(listScannableText(templated, 'x.md'))).toEqual([]);
    expect(listBareCalls(listScannableText(regressed, 'x.md'))).toHaveLength(1);
  });

  it('exempts nothing in a shell file', () => {
    const script = '# Bad: this label scopes to no block here\ntmpdir=$(mktemp -d)\n';

    expect(listBareCalls(listScannableText(script, 'x.sh'))).toHaveLength(1);
  });
});

// region | Helpers

/** Lists the templateless `mktemp` directory calls in a span of text, each trimmed to the text that matched. */
function listBareCalls(text: string): ReadonlyArray<string> {
  return text
    .matchAll(new RegExp(BARE_MKTEMP_SOURCE, 'gm'))
    .map((match) => match[0].trim())
    .toArray();
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

/**
 * Returns a file's text with each labelled negative example removed. The label exempts the lines from itself to the
 * next blank one, so a fence pairing a `# Bad` block with a `# Good` one keeps the second under the scan. Only a
 * fenced block is eligible: at the top level of a Markdown file the same text is an `h1`, and a shell file has no
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

// endregion | Helpers
