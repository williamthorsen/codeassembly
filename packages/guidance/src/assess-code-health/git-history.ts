/** Hotspot and co-change sensors computed from `git log --numstat` output. */

/** One commit's changed files, in the order that `git log` lists them. */
export interface CommitChanges {
  commit: string;
  date: string;
  files: string[];
}

/** A file's churn and size within the window, scored as commits × lines. */
export interface HotspotRow {
  path: string;
  commits: number;
  lines: number;
  score: number;
  rank: number;
}

/** A pair of files that changed together in the same commits. */
export interface CoChangeRow {
  a: string;
  b: string;
  commits: number;
}

/** The commit-size cap above which a commit is treated as a bulk change and ignored. */
export const MAX_FILES_PER_COMMIT = 50;

/** The number of shared commits below which a pair is not reported as coupled. */
export const MIN_SHARED_COMMITS = 3;

/** The paths excluded from every history sensor, as git pathspecs. */
export const DEFAULT_EXCLUDE_PATHSPECS: readonly string[] = [
  ':(exclude,attr:linguist-generated)',
  ...[
    'Cargo.lock',
    'Gemfile.lock',
    'bun.lockb',
    'composer.lock',
    'go.sum',
    'package-lock.json',
    'package.json',
    'pnpm-lock.yaml',
    'poetry.lock',
    'yarn.lock',
  ].map((name) => `:(exclude,glob)**/${name}`),
];

/** The `git log` arguments that `parseNumstatLog` reads, restricted to the unit and the exclusions. */
export function buildLogArgs(unit: string, windowDays: number, excludeGlobs: readonly string[]): string[] {
  return [
    'log',
    '-M',
    '--numstat',
    `--since=${windowDays} days ago`,
    `--format=tformat:${COMMIT_MARKER}%x09%H%x09%cI`,
    '--',
    unit,
    ...DEFAULT_EXCLUDE_PATHSPECS,
    ...excludeGlobs.map((glob) => `:(exclude,glob)${glob}`),
  ];
}

/** Lists the pairs of files existing at `HEAD` that changed together in at least `MIN_SHARED_COMMITS` commits. */
export function computeCoChange(commits: readonly CommitChanges[], existing: ReadonlySet<string>): CoChangeRow[] {
  const pairCounts = new Map<string, number>();
  for (const { files } of filterBulkCommits(commits)) {
    const present = [...new Set(files)].filter((file) => existing.has(file)).toSorted();
    for (let left = 0; left < present.length; left += 1) {
      for (let right = left + 1; right < present.length; right += 1) {
        const key = `${present[left]}\n${present[right]}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const rows: CoChangeRow[] = [];
  for (const [key, count] of pairCounts) {
    if (count < MIN_SHARED_COMMITS) continue;
    const [a = '', b = ''] = key.split('\n', 2);
    rows.push({ a, b, commits: count });
  }
  return rows.toSorted(
    (left, right) => right.commits - left.commits || left.a.localeCompare(right.a) || left.b.localeCompare(right.b),
  );
}

/** Ranks the files that exist at `HEAD` by commits × lines, highest first, ignoring bulk commits. */
export function computeHotspots(
  commits: readonly CommitChanges[],
  lineCounts: ReadonlyMap<string, number>,
): HotspotRow[] {
  const commitCounts = new Map<string, number>();
  for (const { files } of filterBulkCommits(commits)) {
    const unique = new Set(files);
    for (const file of unique) commitCounts.set(file, (commitCounts.get(file) ?? 0) + 1);
  }
  const rows: Array<Omit<HotspotRow, 'rank'>> = [];
  for (const [path, count] of commitCounts) {
    const lines = lineCounts.get(path);
    if (lines !== undefined) rows.push({ path, commits: count, lines, score: count * lines });
  }
  return rows
    .toSorted((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

/** Parses the output of `buildLogArgs` into commits, resolving renamed paths to their new names and skipping binaries. */
export function parseNumstatLog(output: string): CommitChanges[] {
  const commits: CommitChanges[] = [];
  let current: CommitChanges | undefined;
  for (const line of output.split('\n')) {
    if (line.startsWith(`${COMMIT_MARKER}\t`)) {
      const [, commit = '', date = ''] = line.split('\t', 3);
      current = { commit, date, files: [] };
      commits.push(current);
      continue;
    }
    const match = NUMSTAT_PATTERN.exec(line);
    if (match === null || current === undefined) continue;
    const [, added, , path = ''] = match;
    if (added === '-') continue;
    current.files.push(resolveRenamedPath(path));
  }
  return commits;
}

/** Returns the post-rename path of a numstat path in either `old => new` or `dir/{old => new}/file` form. */
export function resolveRenamedPath(path: string): string {
  const braced = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(path);
  if (braced !== null) {
    const [, prefix = '', , after = '', suffix = ''] = braced;
    return `${prefix}${after}${suffix}`.replaceAll('//', '/');
  }
  const arrow = path.indexOf(' => ');
  return arrow === -1 ? path : path.slice(arrow + ' => '.length);
}

// region | Helpers

const COMMIT_MARKER = 'COMMIT';

const NUMSTAT_PATTERN = /^(\d+|-)\t(\d+|-)\t(.+)$/;

/** Drops the commits that touch more than `MAX_FILES_PER_COMMIT` files. */
function filterBulkCommits(commits: readonly CommitChanges[]): CommitChanges[] {
  return commits.filter((commit) => commit.files.length <= MAX_FILES_PER_COMMIT);
}

// endregion | Helpers
