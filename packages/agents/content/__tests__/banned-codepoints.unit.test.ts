import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';

// Fixture data is authored to hold the defects that other suites assert on, so a ban would report a fixture as an
// offender.
const EXCLUDED_PREFIX = '__tests__/fixtures/';

// The build writes these rather than the corpus authoring them: esbuild bundles of the skill helpers.
const GENERATED_EXTENSIONS: ReadonlySet<string> = new Set(['.mjs']);

const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set(['.json', '.md', '.sh', '.ts', '.yaml']);

interface Ban {
  readonly allowlist: ReadonlyArray<Exemption>;
  readonly codepoint: string;
  readonly name: string;
  readonly remedy: string;
}

interface Exemption {
  /** Exempts only the lines containing it; absent, the whole file is exempt. */
  readonly line?: string;
  /** Content-root-relative path. */
  readonly path: string;
}

interface Offender {
  readonly file: string;
  readonly line: number;
}

// Each codepoint is written as an escape: The scan reads this file, so a literal would report the guard itself. The
// non-breaking-space ban is a `validate` rule, which `library-validation` runs over this tree.
const BANS: ReadonlyArray<Ban> = [
  {
    // A whole file is exempt only when the corpus does not author it. `brainstorming` is a verbatim superpowers
    // extract marked do-not-edit, so its prose is out of the rule's reach entirely. `update-jira-ticket` is ordinary
    // skill guidance that happens to document the character. Only the row documenting it is exempt, and a new
    // em-dash anywhere else in the file still fails.
    allowlist: [
      { path: 'skills/brainstorming/SKILL.md' },
      { line: '`&mdash;`', path: 'skills/update-jira-ticket/SKILL.md' },
    ],
    codepoint: '\u{2014}',
    name: 'an em-dash (U+2014)',
    remedy:
      'Because the corpus is the prose read and imitated by an agent, it follows the em-dash rule that it states. ' +
      'Repunctuate the site, or write `--` when a dash is genuinely best.',
  },
];

describe('banned codepoints', () => {
  // A ban is only as wide as the listing feeding it, and a narrowed listing fails nothing on its own: The scans keep
  // passing on the files that they no longer read. The expectation is read from the tree because comparing the
  // listing against `SCANNED_EXTENSIONS` would narrow along with it and assert nothing.
  it('scans every authored extension under content/', async () => {
    const authored = await listAuthoredExtensions();
    const scanned = new Set((await listScannedFiles()).map((file) => path.extname(file)));
    const unscanned = [...authored].filter((extension) => !scanned.has(extension)).toSorted();

    const message = `These extensions are authored under content/ but the bans do not read them: ${unscanned.join(', ')}`;
    expect(unscanned, message).toEqual([]);
  });

  describe.each(BANS)('$name', (ban: Ban) => {
    it('does not appear in any file outside its allowlist', async () => {
      const offenders = await findOffenders(ban);

      expect(offenders, formatOffenders(ban, offenders)).toEqual([]);
    });

    it('has an allowlist whose every entry is still needed', async () => {
      const stale = await findStaleExemptions(ban);

      expect(stale, `Stale allowlist entries:\n  ${stale.join('\n  ')}`).toEqual([]);
    });
  });
});

// region | Helpers

/** Returns every site of the ban's codepoint that the ban does not exempt. */
async function findOffenders(ban: Ban): Promise<ReadonlyArray<Offender>> {
  const offenders: Array<Offender> = [];
  const files = await listScannedFiles();
  for (const file of files) {
    const body = await readFile(path.join(CONTENT_ROOT, file), 'utf8');
    if (!body.includes(ban.codepoint)) continue;

    const exemption = ban.allowlist.find((entry) => entry.path === file);
    for (const [index, line] of body.split('\n').entries()) {
      if (line.includes(ban.codepoint) && !isExempt(exemption, line)) {
        offenders.push({ file, line: index + 1 });
      }
    }
  }
  return offenders;
}

/** Returns a description of each exemption that no longer covers a site, naming why it is spent. */
async function findStaleExemptions(ban: Ban): Promise<ReadonlyArray<string>> {
  const present = new Set(await listScannedFiles());
  const stale: Array<string> = [];
  for (const exemption of ban.allowlist) {
    if (!present.has(exemption.path)) {
      stale.push(`${exemption.path}: no such file`);
      continue;
    }

    const body = await readFile(path.join(CONTENT_ROOT, exemption.path), 'utf8');
    const covered = body.split('\n').some((line) => line.includes(ban.codepoint) && isExempt(exemption, line));
    if (!covered) {
      stale.push(`${exemption.path}: no longer contains ${ban.name} exempted by the entry`);
    }
  }
  return stale;
}

/** Renders the offenders as a failure message; empty when there are none. */
function formatOffenders(ban: Ban, offenders: ReadonlyArray<Offender>): string {
  if (offenders.length === 0) return '';

  const sites = offenders.map((offender) => `  ${offender.file}:${offender.line}`);
  return [`These sites contain ${ban.name}. ${ban.remedy}`, ...sites].join('\n');
}

/** True when the exemption permits the ban's codepoint on this line. */
function isExempt(exemption: Exemption | undefined, line: string): boolean {
  if (exemption === undefined) return false;

  const marker = exemption.line;
  return marker === undefined || line.includes(marker);
}

/**
 * Returns every extension authored by the corpus under `content/`, which is every one that the build does not write.
 */
async function listAuthoredExtensions(): Promise<ReadonlySet<string>> {
  const entries = await readdir(CONTENT_ROOT, { recursive: true, withFileTypes: true });
  const extensions = entries.filter((entry) => entry.isFile()).map((entry) => path.extname(entry.name));
  return new Set(extensions.filter((extension) => extension !== '' && !GENERATED_EXTENSIONS.has(extension)));
}

/** Returns every file read by the bans, as content-root-relative POSIX paths. */
async function listScannedFiles(): Promise<ReadonlyArray<string>> {
  const entries = await readdir(CONTENT_ROOT, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SCANNED_EXTENSIONS.has(path.extname(entry.name)))
    .map((entry) => path.relative(CONTENT_ROOT, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .filter((file) => !file.startsWith(EXCLUDED_PREFIX))
    .toSorted();
}

// endregion | Helpers
