import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runDetect, runRecord } from '../cli.ts';
import { RECORD_PATH } from '../parse-record.ts';
import { stringifyRecord } from '../record.ts';
import type { DetectResult, DetectSuccess, ProseRecord, RecordResult, RunFold, SweepVersions } from '../types.ts';
import { makeFakeGit } from './make-fake-git.ts';

/** The detector rules that `bothRules` names under unit `writing`. */
export const BOTH_RULES: ReadonlyArray<string> = ['em-dash', 'reduced-object-relative'];

/** The invocation naming both rules at sweep version 1 under unit `writing` at `unitVersion`, which most assertions read. */
export function bothRules(unitVersion = '2'): string[] {
  return [
    '--unit',
    `writing=${unitVersion}`,
    '--rule',
    'em-dash@1=writing',
    '--rule',
    'reduced-object-relative@1=writing',
  ];
}

/** Creates a scratch root containing the fixture tree. */
export async function createFixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'revise-prose-cli-'));
  for (const [file, content] of Object.entries(FIXTURE_FILES)) {
    await mkdir(path.join(root, path.dirname(file)), { recursive: true });
    await writeFile(path.join(root, file), content, 'utf8');
  }
  return root;
}

export const EM_DASH_SENTENCE = 'The cache is cold\u{2014}so the transport reconnects.';

/** Narrows a result to its success arm, failing the test with the helper's own message when it is not one. */
export function expectSuccess(result: DetectResult): DetectSuccess {
  if (!result.ok) {
    throw new Error(`expected a successful sweep, got ${result.error}: ${result.message}`);
  }
  return result;
}

/** A fold rejecting the fixture's object-relative site, which the record round-trip assertions read. */
export async function fold(root: string): Promise<RunFold> {
  return {
    sweptAt: '2026-09-02',
    roots: ['.'],
    units: { writing: '2' },
    rules: {
      'em-dash': { unit: 'writing', version: '1' },
      'reduced-object-relative': { unit: 'writing', version: '1' },
    },
    rejections: [
      {
        rule: 'reduced-object-relative',
        file: 'docs/guide.md',
        phrase: await rejectedPhrase(root),
        ground: 'a quoted exhibit of the construction',
      },
    ],
  };
}

/**
 * The fold from `fold`, not reporting any rejection, as a run reports a batch that leaves every inherited site
 * alone.
 */
export async function foldRejectingNothing(root: string): Promise<RunFold> {
  return { ...(await fold(root)), rejections: [] };
}

/** Lists every file beneath `root`, repository-relative with forward slashes, sorted as git sorts them. */
export async function listTree(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .toSorted();
}

/**
 * What a written record is read back against: empty version maps, since a record in the per-rule shape does not need
 * any versions.
 */
export const NO_VERSIONS: SweepVersions = { units: new Map(), rules: new Map() };

export const OBJECT_RELATIVE = 'The helper reports the source it names.';

/**
 * A fixture tree containing one site of each rule, in two directories, so that batching and per-file coverage both
 * have something to separate.
 */
export const FIXTURE_FILES: Readonly<Record<string, string>> = {
  'docs/guide.md': `${OBJECT_RELATIVE}\n`,
  'src/notes.md': `${EM_DASH_SENTENCE}\n`,
};

/** Records a fold into the fixture tree through the fake git adapter, anchoring `home` as `sweep` does. */
export async function recordFold(root: string, foldJson: string): Promise<RecordResult> {
  return runRecord({ foldJson, root: root, home: root }, makeFakeGit({ files: await listTree(root) }));
}

/** A record covering the whole repository for both rules at `version`, rejecting one site in `file` at that version. */
export function recordFor(phrase: string, version = '1', file = 'docs/guide.md'): ProseRecord {
  const coverage = { version, 'swept-at': '2026-09-02', detected: true, roots: ['.'] };
  return {
    rules: Object.fromEntries(BOTH_RULES.map((rule) => [rule, coverage])),
    rejections: [
      {
        rule: 'reduced-object-relative',
        'rule-version': version,
        file,
        phrase,
        ground: 'a quoted exhibit of the construction',
      },
    ],
  };
}

/**
 * The phrase reported by the detector for the fixture's object-relative site. Read from a sweep rather than
 * written out, so that a change to the span that a detector reports fails the assertion instead of silently
 * missing the rejection.
 */
export async function rejectedPhrase(root: string): Promise<string> {
  const candidate = expectSuccess(await sweep(root)).candidates[0];
  if (candidate === undefined) throw new Error('the fixture did not yield an object-relative candidate');
  return candidate.phrase;
}

/**
 * Sweeps the fixture tree, anchoring `home` at the scratch tree so that the run does not read the real preferences.
 * The fake git adapter lists every file in the tree as the sweep starts, as git would for an untracked tree.
 */
export async function sweep(root: string, argv: readonly string[] = []): Promise<DetectResult> {
  return runDetect({ argv, root: root, home: root }, makeFakeGit({ files: await listTree(root) }));
}

/** Writes a record into the fixture tree. */
export async function writeRecord(root: string, record: ProseRecord): Promise<void> {
  await mkdir(path.join(root, '.agents'), { recursive: true });
  await writeFile(path.join(root, RECORD_PATH), stringifyRecord(record), 'utf8');
}
