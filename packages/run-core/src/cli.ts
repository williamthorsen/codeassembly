/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { mkdir, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';

import { discoverRunDirectories, validateRunDirectory } from './scanners/index.js';
import type { RunDirectoryEntry } from './scanners/run-directory-scanner.js';

interface InvalidEntry {
  entry: RunDirectoryEntry;
  reason: string;
}

function parseFlag(arg: string): 'help' | 'path' | null {
  const flags: Record<string, 'help' | 'path'> = {
    '--help': 'help',
    '-h': 'help',
    '--path': 'path',
  };
  return flags[arg] ?? null;
}

function parseArgs(argv: ReadonlyArray<string>): {
  command: string;
  basePath: string;
  help: boolean;
} {
  const args = argv.slice(2);
  let command = '';
  let basePath = process.env.AI_PROJECTS_PATH ?? join(homedir(), '.ai', 'projects');
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    const flag = parseFlag(arg);
    switch (flag) {
      case 'help':
        help = true;
        break;
      case 'path': {
        const nextArg = args[i + 1];
        if (!nextArg || nextArg.startsWith('--')) {
          console.error('Error: --path requires a directory path');
          process.exit(1);
        }
        basePath = nextArg;
        i++;
        break;
      }
      default:
        if (arg.startsWith('-')) {
          console.error(`Error: Unknown option "${arg}"`);
          process.exit(1);
        } else if (!command) {
          command = arg;
        }
    }
  }

  return { command: command || 'check', basePath, help };
}

function printUsage(): void {
  console.info(`Usage: codeassembly-runs [command] [options]

Commands:
  check       List invalid run directories (default)
  archive     List and offer to move invalid run directories

Options:
  --path <dir>   Base projects directory (default: AI_PROJECTS_PATH or ~/.ai/projects)
  --help, -h     Show this help message`);
}

async function findInvalidRuns(basePath: string): Promise<InvalidEntry[]> {
  const entries = await discoverRunDirectories(basePath);
  const invalid: InvalidEntry[] = [];

  for (const entry of entries) {
    try {
      const result = await validateRunDirectory(entry.runPath);
      if (!result.valid) {
        invalid.push({ entry, reason: result.reason });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      invalid.push({ entry, reason: `unexpected error: ${message}` });
    }
  }

  return invalid;
}

function printReport(invalid: InvalidEntry[], basePath: string): void {
  if (invalid.length === 0) {
    console.info('All run directories are valid.');
    return;
  }

  console.info(`Found ${String(invalid.length)} invalid run ${invalid.length === 1 ? 'directory' : 'directories'}:\n`);
  for (const { entry, reason } of invalid) {
    const relPath = relative(basePath, entry.runPath);
    console.info(`  ${relPath}`);
    console.info(`    Reason: ${reason}\n`);
  }
}

async function promptYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

/** Resolves the archive path for a run directory within its project. */
function resolveArchivePath(entry: RunDirectoryEntry, basePath: string): string {
  const projectPath = join(basePath, entry.projectSlug);
  return join(projectPath, 'tickets-archived', entry.ticketId, entry.runId);
}

async function archiveRuns(invalid: InvalidEntry[], basePath: string): Promise<void> {
  const confirmed = await promptYesNo(
    `Move ${String(invalid.length)} invalid ${invalid.length === 1 ? 'directory' : 'directories'} to tickets-archived/? (y/N) `,
  );

  if (!confirmed) {
    console.info('Archive cancelled.');
    return;
  }

  for (const { entry } of invalid) {
    const archivePath = resolveArchivePath(entry, basePath);
    await mkdir(dirname(archivePath), { recursive: true });
    await rename(entry.runPath, archivePath);
    const relSource = relative(basePath, entry.runPath);
    const relDest = relative(basePath, archivePath);
    console.info(`  Moved ${relSource} -> ${relDest}`);
  }

  console.info(`\nArchived ${String(invalid.length)} ${invalid.length === 1 ? 'directory' : 'directories'}.`);
}

async function runCheck(basePath: string): Promise<void> {
  const invalid = await findInvalidRuns(basePath);
  printReport(invalid, basePath);
  process.exit(invalid.length > 0 ? 1 : 0);
}

async function runArchive(basePath: string): Promise<void> {
  const invalid = await findInvalidRuns(basePath);
  printReport(invalid, basePath);
  if (invalid.length > 0) {
    await archiveRuns(invalid, basePath);
  }
}

async function main(): Promise<void> {
  const { command, basePath, help } = parseArgs(process.argv);

  if (help) {
    printUsage();
    process.exit(0);
  }

  if (command === 'check') {
    await runCheck(basePath);
  } else if (command === 'archive') {
    await runArchive(basePath);
  } else {
    console.error(`Error: Unknown command "${command}"`);
    printUsage();
    process.exit(1);
  }
}

await main();
