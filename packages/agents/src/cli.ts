/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import process from 'node:process';

import { generateLabelMap, printGenerateUsage } from './commands/generate-label-map.ts';
import { initCommand, initGlobalCommand } from './commands/init.ts';
import { installCommand } from './commands/install.ts';
import { libraryListCommand, printLibraryUsage } from './commands/library-list.ts';
import { statusCommand } from './commands/status.ts';
import { syncCommand, syncGlobalCommand } from './commands/sync.ts';
import { uninstallCommand } from './commands/uninstall.ts';
import type { HarnessId, InstallOptions } from './lib/types.ts';

const VALID_HARNESS_IDS = new Set<string>(['claude', 'rovodev', 'all']);

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const { command, subcommand, options, help, global } = parseArgs(process.argv);

  if (help || !command) {
    printUsage();
    process.exit(help ? 0 : 1);
  }

  try {
    switch (command) {
      case 'install':
        await installCommand(options);
        break;
      case 'init':
        await (global ? initGlobalCommand(options) : initCommand(options));
        break;
      case 'sync':
        await (global ? syncGlobalCommand(options) : syncCommand(options));
        break;
      case 'uninstall':
        await uninstallCommand({ harness: options.harness, force: options.force });
        break;
      case 'status':
        await statusCommand({ harness: options.harness });
        break;
      case 'library':
        if (subcommand === 'list') {
          await libraryListCommand();
        } else {
          if (subcommand) console.error(`Error: Unknown library subcommand "${subcommand}"`);
          printLibraryUsage();
          process.exit(1);
        }
        break;
      case 'generate':
        if (subcommand === 'label-map') {
          await generateLabelMap({ force: options.force });
        } else {
          if (subcommand) console.error(`Error: Unknown generate target "${subcommand}"`);
          printGenerateUsage();
          process.exit(1);
        }
        break;
      default:
        console.error(`Error: Unknown command "${command}"`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('An unexpected error occurred');
    }
    process.exit(1);
  }
}

// region | Helpers

function isValidHarness(value: string): value is HarnessId | 'all' {
  return VALID_HARNESS_IDS.has(value);
}

/** Parses CLI arguments into a structured options object. */
function parseArgs(argv: ReadonlyArray<string>): {
  command: string;
  subcommand: string;
  options: InstallOptions;
  help: boolean;
  global: boolean;
} {
  const args = argv.slice(2);
  let command = '';
  let subcommand = '';
  let harness: InstallOptions['harness'] = 'all';
  let link = false;
  let force = false;
  let dryRun = false;
  let help = false;
  let global = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    const flag = parseFlag(arg);
    switch (flag) {
      case 'help':
        help = true;
        break;
      case 'link':
        link = true;
        break;
      case 'force':
        force = true;
        break;
      case 'dry-run':
        dryRun = true;
        break;
      case 'global':
        global = true;
        break;
      case 'harness': {
        const result = parseHarnessArg(args, i);
        harness = result.harness;
        i = result.nextIndex;
        break;
      }
      default:
        if (arg.startsWith('-')) {
          console.error(`Error: Unknown option "${arg}"`);
          process.exit(1);
        } else if (!command) {
          command = arg;
        } else if (!subcommand) {
          subcommand = arg;
        }
    }
  }

  return {
    command,
    subcommand,
    options: { harness, link, force, dryRun },
    help,
    global,
  };
}

function parseFlag(arg: string): 'help' | 'link' | 'force' | 'dry-run' | 'global' | 'harness' | null {
  const flags: Record<string, 'help' | 'link' | 'force' | 'dry-run' | 'global' | 'harness'> = {
    '--help': 'help',
    '-h': 'help',
    '--link': 'link',
    '--force': 'force',
    '--dry-run': 'dry-run',
    '--global': 'global',
    '--harness': 'harness',
  };
  return flags[arg] ?? null;
}

function parseHarnessArg(
  args: ReadonlyArray<string>,
  index: number,
): { harness: HarnessId | 'all'; nextIndex: number } {
  const nextArg = args[index + 1];
  if (!nextArg || nextArg.startsWith('--')) {
    console.error('Error: --harness requires a value (claude, rovodev, or all)');
    process.exit(1);
  }
  if (!isValidHarness(nextArg)) {
    console.error(`Error: Invalid harness "${nextArg}". Valid options: claude, rovodev, all`);
    process.exit(1);
  }
  return { harness: nextArg, nextIndex: index + 1 };
}

/**
 * Prints usage information to stdout.
 */
function printUsage(): void {
  console.info(`Usage: codeassembly-agents <command> [options]

Commands:
  install          Install guidance, skills, and subagents into harness directories, removing files whose source was deleted
  init             Scaffold an empty .agents/codeassembly.yaml in the current project
  sync             Resolve .agents/codeassembly.yaml and materialize declared rulebooks, skills, and subagents
  uninstall        Remove installed guidance, skills, and subagents
  status           Show the current state of installed items
  library list     List available library artifacts (rulebooks, skills, subagents)
  generate <target> Generate a configuration file (e.g., label-map)

Options:
  --harness <name>  Target harness: claude, rovodev, or all (default: all)
  --link             Use symlinks instead of copies (install only)
  --force            Overwrite or remove modified files (install/uninstall)
  --dry-run          Show what would be done without making changes (install, sync, init)
  --global           Sync the user-global tier (~/.agents/codeassembly.yaml) into the home harness dirs (sync only)
  --help, -h         Show this help message`);
}

// endregion | Helpers

await main();
