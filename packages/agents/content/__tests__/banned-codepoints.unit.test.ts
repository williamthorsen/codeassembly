import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

// Fixture data is authored to hold the defects other suites assert on, so a ban would report a fixture as an offender.
const EXCLUDED_PREFIX = '__tests__/fixtures/';

const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set(['.json', '.md', '.sh', '.ts', '.yaml']);

interface Ban {
  /** Content-root-relative paths permitted to contain the codepoint. */
  readonly allowlist: ReadonlySet<string>;
  readonly codepoint: string;
  readonly name: string;
  readonly remedy: string;
}

interface Offender {
  readonly file: string;
  readonly line: number;
}

// Each codepoint is written as an escape. The scan reads this file, so a literal would report the guard itself, and a
// literal non-breaking space is invisible in source besides.
//
// The scan decodes each file rather than matching bytes. 0xA0 is a continuation byte of ■ (U+25A0) and ➕ (U+2795), so
// a byte-level search reports every gradient example as a hit.
const BANS: ReadonlyArray<Ban> = [
  {
    // The ban is total rather than indent-only: the sole reason to type one into guidance is to indent a subordinate
    // line, and a blanket check needs no parsing to decide.
    allowlist: new Set<string>(),
    codepoint: '\u{A0}',
    name: 'a non-breaking space (U+00A0)',
    remedy:
      'A whitespace indent does not survive terminal rendering; the line collapses to the left margin and the ' +
      'reader cannot tell which option its reasoning belongs to. Nest the reasoning as a list item instead.',
  },
  {
    allowlist: new Set<string>([
      // A verbatim superpowers extract, marked do-not-edit.
      'skills/brainstorming/SKILL.md',
      // The `&mdash;` row of its character-reference table.
      'skills/update-jira-ticket/SKILL.md',
    ]),
    codepoint: '\u{2014}',
    name: 'an em-dash (U+2014)',
    remedy:
      'The corpus is the prose an agent reads and imitates, so it follows the em-dash rule it states. Repunctuate ' +
      'the site, or write `--` where a dash is genuinely best.',
  },
];

describe('banned codepoints', () => {
  describe.each(BANS)('$name', (ban: Ban) => {
    it('appears in no file outside its allowlist', async () => {
      const offenders = await findOffenders(ban);

      expect(offenders, formatOffenders(ban, offenders)).toEqual([]);
    });

    it('has an allowlist naming only files that exist', async () => {
      const present = new Set(await listScannedFiles());
      const missing = [...ban.allowlist].filter((entry) => !present.has(entry)).toSorted();

      expect(missing, `Stale allowlist entries (file no longer exists): ${missing.join(', ')}`).toEqual([]);
    });
  });
});

// region | Helpers

/** Returns every site of the ban's codepoint in a file the ban does not allow it in. */
async function findOffenders(ban: Ban): Promise<ReadonlyArray<Offender>> {
  const offenders: Array<Offender> = [];
  const files = await listScannedFiles();
  for (const file of files) {
    if (ban.allowlist.has(file)) continue;

    const body = await readFile(path.join(CONTENT_ROOT, file), 'utf8');
    if (!body.includes(ban.codepoint)) continue;

    for (const [index, line] of body.split('\n').entries()) {
      if (line.includes(ban.codepoint)) {
        offenders.push({ file, line: index + 1 });
      }
    }
  }
  return offenders;
}

/** Renders the offenders as a failure message; empty when there are none. */
function formatOffenders(ban: Ban, offenders: ReadonlyArray<Offender>): string {
  if (offenders.length === 0) return '';

  const sites = offenders.map((offender) => `  ${offender.file}:${offender.line}`);
  return [`These sites contain ${ban.name}. ${ban.remedy}`, ...sites].join('\n');
}

/** Returns every file the bans read, as content-root-relative POSIX paths. */
async function listScannedFiles(): Promise<ReadonlyArray<string>> {
  const entries = await readdir(CONTENT_ROOT, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SCANNED_EXTENSIONS.has(path.extname(entry.name)))
    .map((entry) => path.relative(CONTENT_ROOT, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .filter((file) => !file.startsWith(EXCLUDED_PREFIX))
    .toSorted();
}

// endregion | Helpers
