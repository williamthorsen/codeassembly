/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import process from 'node:process';

import { generateLabelMap, printGenerateUsage } from './commands/generate-label-map.js';
import { installCommand } from './commands/install.js';
import { statusCommand } from './commands/status.js';
import { uninstallCommand } from './commands/uninstall.js';
import type { InstallOptions, PlatformId } from './lib/types.js';

const VALID_PLATFORM_IDS = new Set<string>(['claude', 'rovodev', 'all']);

function isValidPlatform(value: string): value is PlatformId | 'all' {
  return VALID_PLATFORM_IDS.has(value);
}

function parsePlatformArg(
  args: ReadonlyArray<string>,
  index: number,
): { platform: PlatformId | 'all'; nextIndex: number } {
  const nextArg = args[index + 1];
  if (!nextArg || nextArg.startsWith('--')) {
    console.error('Error: --platform requires a value (claude, rovodev, or all)');
    process.exit(1);
  }
  if (!isValidPlatform(nextArg)) {
    console.error(`Error: Invalid platform "${nextArg}". Valid options: claude, rovodev, all`);
    process.exit(1);
  }
  return { platform: nextArg, nextIndex: index + 1 };
}

function parseFlag(arg: string): 'help' | 'link' | 'force' | 'dry-run' | 'platform' | null {
  const flags: Record<string, 'help' | 'link' | 'force' | 'dry-run' | 'platform'> = {
    '--help': 'help',
    '-h': 'help',
    '--link': 'link',
    '--force': 'force',
    '--dry-run': 'dry-run',
    '--platform': 'platform',
  };
  return flags[arg] ?? null;
}

/**
 * Parses CLI arguments into a structured options object.
 */
function parseArgs(argv: ReadonlyArray<string>): {
  command: string;
  subcommand: string;
  options: InstallOptions;
  help: boolean;
} {
  const args = argv.slice(2);
  let command = '';
  let subcommand = '';
  let platform: InstallOptions['platform'] = 'all';
  let link = false;
  let force = false;
  let dryRun = false;
  let help = false;

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
      case 'platform': {
        const result = parsePlatformArg(args, i);
        platform = result.platform;
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
    options: { platform, link, force, dryRun },
    help,
  };
}

/**
 * Prints usage information to stdout.
 */
function printUsage(): void {
  console.info(`Usage: codeassembly-agents <command> [options]

Commands:
  install          Install guidance, skills, and subagents into platform directories
  uninstall        Remove installed guidance, skills, and subagents
  status           Show the current state of installed items
  generate <target> Generate a configuration file (e.g., label-map)

Options:
  --platform <name>  Target platform: claude, rovodev, or all (default: all)
  --link             Use symlinks instead of copies (install only)
  --force            Overwrite modified files (install/uninstall)
  --dry-run          Show what would be done without making changes (install only)
  --help, -h         Show this help message`);
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const { command, subcommand, options, help } = parseArgs(process.argv);

  if (help || !command) {
    printUsage();
    process.exit(help ? 0 : 1);
  }

  try {
    switch (command) {
      case 'install':
        await installCommand(options);
        break;
      case 'uninstall':
        await uninstallCommand({ platform: options.platform, force: options.force });
        break;
      case 'status':
        await statusCommand({ platform: options.platform });
        break;
      case 'generate':
        if (subcommand === 'label-map') {
          await generateLabelMap({ force: options.force });
        } else {
          if (subcommand) {
            console.error(`Error: Unknown generate target "${subcommand}"`);
          }
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

await main();
