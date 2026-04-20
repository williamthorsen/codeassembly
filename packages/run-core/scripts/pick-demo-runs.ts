/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import process from 'node:process';

import { resolveProjectsDir } from '../src/config.js';
import { foldEvents } from '../src/event-folder.js';
import { parseRunRawData } from '../src/parsers/run-data-parser.js';
import { RunDataParseError } from '../src/run-data-parse-error.js';
import { discoverRunDirectories, type RunDirectoryEntry } from '../src/scanners/run-directory-scanner.js';
import type { CanonicalRunStatus } from '../src/types/canonical.js';
import type { RunEvent } from '../src/types/run-log.js';
import { type ScoreResult, scoreRun } from './demo-scorer.js';

const DEFAULT_TOP = 5;

interface Options {
  top: number;
  project: string | undefined;
  since: Date | undefined;
  json: boolean;
  help: boolean;
}

interface RankedRun {
  projectSlug: string;
  ticketId: string;
  runId: string;
  score: number;
  signals: ScoreResult['signals'];
  summary: string;
  startedAt: string;
}

/** Entry point: parse args, walk the archive, score runs, print top N. */
async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    printUsage();
    process.exit(0);
  }

  const basePath = await resolveProjectsDir(process.cwd());
  process.stderr.write(`[pick-demo-runs] scanning ${basePath}\n`);

  const entries = await discoverRunDirectories(basePath);
  const filteredEntries = opts.project ? entries.filter((e) => e.projectSlug === opts.project) : entries;

  const ranked = await rankEntries(filteredEntries, opts);

  if (ranked.length === 0) {
    process.stdout.write('No runs matched the given filters.\n');
    return;
  }

  const topN = ranked.slice(0, opts.top);
  process.stdout.write(opts.json ? renderJson(topN) : renderMarkdown(topN));
}

async function rankEntries(entries: RunDirectoryEntry[], opts: Options): Promise<RankedRun[]> {
  const ranked: RankedRun[] = [];
  const now = new Date();

  for (const entry of entries) {
    const parsed = await safeParse(entry);
    if (!parsed) continue;

    const { status, events } = parsed;

    if (opts.since && !passesSinceFilter(status.startedAt, opts.since)) continue;

    const result = scoreRun(status, events, now);
    ranked.push({
      projectSlug: entry.projectSlug,
      ticketId: entry.ticketId,
      runId: entry.runId,
      score: result.score,
      signals: result.signals,
      summary: result.summary,
      startedAt: status.startedAt,
    });
  }

  // Sort by score desc, then by startedAt desc (newer wins ties).
  ranked.sort((a, b) => b.score - a.score || b.startedAt.localeCompare(a.startedAt));
  return ranked;
}

/** Parse a run directory, logging and skipping on any parse error. */
async function safeParse(
  entry: RunDirectoryEntry,
): Promise<{ status: CanonicalRunStatus; events: RunEvent[] } | undefined> {
  try {
    const { header, events } = await parseRunRawData(entry.runPath);
    const status = foldEvents(header, events);
    return { status, events };
  } catch (error) {
    const reason = error instanceof RunDataParseError ? error.category : errorMessage(error);
    process.stderr.write(
      `[pick-demo-runs] skipping ${entry.projectSlug}/${entry.ticketId}/${entry.runId}: ${reason}\n`,
    );
    return undefined;
  }
}

function passesSinceFilter(startedAt: string, since: Date): boolean {
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return false;
  return started >= since.getTime();
}

// -- Rendering --

function renderMarkdown(rows: ReadonlyArray<RankedRun>): string {
  const paths = rows.map((r) => `${r.projectSlug}/${r.ticketId}/${r.runId}`);
  const pathWidth = Math.max(4, ...paths.map((p) => p.length));
  const scoreWidth = Math.max(5, ...rows.map((r) => String(r.score).length));
  const summaryWidth = Math.max(7, ...rows.map((r) => r.summary.length));

  const header = `| ${'path'.padEnd(pathWidth)} | ${'score'.padStart(scoreWidth)} | ${'summary'.padEnd(summaryWidth)} |`;
  const separator = `| ${'-'.repeat(pathWidth)} | ${'-'.repeat(scoreWidth)} | ${'-'.repeat(summaryWidth)} |`;
  const lines = rows.map((r, i) => {
    const path = paths[i] ?? '';
    return `| ${path.padEnd(pathWidth)} | ${String(r.score).padStart(scoreWidth)} | ${r.summary.padEnd(summaryWidth)} |`;
  });

  return [header, separator, ...lines, ''].join('\n');
}

function renderJson(rows: ReadonlyArray<RankedRun>): string {
  const payload = rows.map(({ startedAt: _startedAt, ...rest }) => rest);
  return `${JSON.stringify(payload, null, 2)}\n`;
}

// -- Argument parsing --

function parseArgs(args: ReadonlyArray<string>): Options {
  let top = DEFAULT_TOP;
  let project: string | undefined;
  let since: Date | undefined;
  let json = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    switch (arg) {
      case '--help':
      case '-h':
        help = true;
        break;
      case '--json':
        json = true;
        break;
      case '--top':
        top = parseTopValue(requireValue(args, i, '--top'));
        i++;
        break;
      case '--project':
        project = requireValue(args, i, '--project');
        i++;
        break;
      case '--since':
        since = parseSinceValue(requireValue(args, i, '--since'));
        i++;
        break;
      default:
        fail(`Unknown option "${arg}"`);
    }
  }

  return { top, project, since, json, help };
}

function requireValue(args: ReadonlyArray<string>, index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    fail(`${flag} requires a value`);
  }
  return value;
}

function parseTopValue(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    fail(`--top must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

function parseSinceValue(raw: string): Date {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    fail(`--since must be a valid ISO date, got "${raw}"`);
  }
  return date;
}

function fail(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function printUsage(): void {
  process.stdout.write(`Usage: pnpm exec tsx packages/run-core/scripts/pick-demo-runs.ts [options]

Rank orchestrated runs in the artifact archive by demo-worthiness.

Options:
  --top <n>          Top-N runs to return (default: ${String(DEFAULT_TOP)})
  --project <slug>   Restrict to a single project slug
  --since <date>     ISO date; include runs started on or after this date
  --json             Emit JSON instead of markdown
  --help, -h         Show this help message
`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

await main();
