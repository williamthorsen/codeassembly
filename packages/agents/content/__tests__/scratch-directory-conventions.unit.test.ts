import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Bare `mktemp -d` reads the Darwin per-user temp directory rather than `$TMPDIR`, and the agent sandbox denies that
// path. The command then exits non-zero with empty stdout, and `cd ""` returns 0, so a script carrying the empty value
// writes into the invoking directory instead. That failure took out 139 shellspec examples and, in a consuming repo,
// routed verification writes into a working tree. The form below is the one that resolves on every machine.
const PACKAGE_ROOT = new URL('../../', import.meta.url).pathname;

/**
 * `mktemp -d` reached without a template argument: end of line, a pipe, a redirect, or a closing `)`. Held as a source
 * string because a shared global regex carries `lastIndex` between uses, which would let one assertion decide another.
 */
const BARE_MKTEMP_SOURCE = String.raw`mktemp\s+-d\s*(?:$|[|)>&;])`;

/** A fenced block opens a negative example by labelling itself, which is what exempts the call it demonstrates. */
const BAD_EXAMPLE_LABEL = /^\s*#\s*Bad\b/m;

const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set(['.md', '.sh']);

/** Directories holding no authored source: build output, dependencies, and the harness's own fixtures. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['dist', 'fixtures', 'node_modules']);

describe('scratch-directory conventions', () => {
  it('names a template on every mktemp call outside a labelled negative example', async () => {
    const violations: Array<string> = [];

    const files = await listScannedFiles(PACKAGE_ROOT);

    for (const file of files) {
      const content = await readFile(file, 'utf8');
      const relativePath = path.relative(PACKAGE_ROOT, file);

      for (const region of listUnlabelledRegions(content, file)) {
        for (const call of listBareCalls(region)) {
          violations.push(`${relativePath} -> ${call}`);
        }
      }
    }

    const message =
      'Bare `mktemp -d` ignores $TMPDIR and picks a path the agent sandbox denies. Write ' +
      '`mktemp -d "${TMPDIR:-/tmp}/<prefix>.XXXXXX"`, or label the block `# Bad:` where the failure is the point:\n  ' +
      violations.join('\n  ');
    expect(violations, message).toEqual([]);
  });

  // Every assertion above is negative, so a scan that stopped reading files would leave the suite green.
  it('reads the files it scans', async () => {
    const files = await listScannedFiles(PACKAGE_ROOT);

    expect(files.some((file) => file.endsWith(path.join('spec', 'spec_helper.sh')))).toBe(true);
    expect(files.some((file) => file.endsWith(path.join('_partials', 'live-repo-writes.md')))).toBe(true);
  });

  it('reports a bare call and exempts a labelled one', () => {
    const bare = '```bash\ntmpdir=$(mktemp -d)\n```\n';
    const labelled = '```bash\n# Bad: the bare call fails under an agent sandbox\ntmpdir=$(mktemp -d)\n```\n';

    expect(listBareCalls(listUnlabelledRegions(bare, 'x.md').join('\n'))).toHaveLength(1);
    expect(listBareCalls(listUnlabelledRegions(labelled, 'x.md').join('\n'))).toEqual([]);
  });
});

// region | Helpers

/** Lists the templateless `mktemp -d` calls in a region, each trimmed to the text that matched. */
function listBareCalls(region: string): ReadonlyArray<string> {
  return region
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
 * Splits a file into the regions the scan reads, dropping any fenced block that labels itself a negative example.
 * A shell file is one region, since its `# Bad` comment scopes to no block the way a Markdown fence does.
 */
function listUnlabelledRegions(content: string, file: string): ReadonlyArray<string> {
  if (!file.endsWith('.md')) return [content];

  const regions: Array<string> = [];
  let current: Array<string> = [];

  const flush = (): void => {
    const region = current.join('\n');
    if (!BAD_EXAMPLE_LABEL.test(region)) regions.push(region);
    current = [];
  };

  for (const line of content.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();

  return regions;
}

// endregion | Helpers
