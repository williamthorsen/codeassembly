/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';
import {
  describeInvalidOutputStyle,
  type OutputStyleResolution,
  resolveOutputStyle,
} from '@williamthorsen/toolbelt.terminal/candidate';

import { bundleHelpersCommand } from './commands/bundle-helpers.ts';
import { configureHooksCommand } from './commands/configure-hooks.ts';
import { generateLabelMap, printGenerateUsage } from './commands/generate-label-map.ts';
import { initCommand, initGlobalCommand } from './commands/init.ts';
import { installCommand } from './commands/install.ts';
import { libraryListCommand, printLibraryUsage } from './commands/library-list.ts';
import { sizesCommand } from './commands/sizes.ts';
import { statusCommand } from './commands/status.ts';
import { renderDryRunReport, renderSyncReport } from './commands/sync/report.ts';
import { syncCommand, syncGlobalCommand } from './commands/sync/sync.ts';
import { isSyncValidationError } from './commands/sync/sync-validation-error.ts';
import { uninstallCommand } from './commands/uninstall.ts';
import { validateCommand } from './commands/validate.ts';
import { formatContentDefects } from './lib/content-defects.ts';
import { configureOutputStyle, emitReport, printLine } from './lib/emit-report.ts';
import { ALL_HARNESS_IDS } from './lib/harness.ts';
import type { HarnessId, InstallOptions } from './lib/types.ts';

const HARNESS_ARG_VALUES: ReadonlyArray<string> = [...ALL_HARNESS_IDS, 'all'];

/** Widened to `string` so that an arbitrary value tests without a type assertion. */
const VALID_HARNESS_IDS: ReadonlySet<string> = new Set(HARNESS_ARG_VALUES);

const HARNESS_ARG_LIST = HARNESS_ARG_VALUES.join(', ');

const OUTPUT_STYLE_ENV_VAR = 'CODEASSEMBLY_OUTPUT_STYLE';

const SYNC_FAILURE_EFFECT = 'Nothing was written; the previously deployed guidance remains in effect.';

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  configureStreamStyles();
  const { command, subcommand, options, check, content, help, global, warnOnly } = parseArgs(process.argv);

  if (help || !command) {
    printUsage();
    process.exit(help ? 0 : 1);
  }

  try {
    switch (command) {
      case 'install':
        await installCommand(options);
        break;
      case 'configure-hooks':
        await configureHooksCommand(options);
        break;
      case 'init':
        await (global ? initGlobalCommand(options) : initCommand(options));
        break;
      case 'sync':
        await runSync(options, global, warnOnly);
        break;
      case 'uninstall':
        await uninstallCommand({ harness: options.harness, force: options.force });
        break;
      case 'sizes':
        await sizesCommand({ global });
        break;
      case 'status':
        await statusCommand({ harness: options.harness });
        break;
      // Exit here because a defect report is a multi-line list of findings, which the `catch` below would prefix
      // with `Error:` as though it were one failure.
      case 'validate':
        if (!(await validateCommand({ content, harness: options.harness }))) {
          process.exit(1);
        }
        break;
      // Exit here for the same reason as `validate`: A drift report lists one finding per bundle.
      case 'bundle-helpers':
        if (!(await bundleHelpersCommand({ check, content }))) {
          process.exit(1);
        }
        break;
      case 'library':
        await runLibrary(subcommand);
        break;
      case 'generate':
        await runGenerate(subcommand, options);
        break;
      default:
        console.error(`Error: Unknown command "${command}"`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${describeError(error)}`);
    process.exit(1);
  }
}

// region | Helpers

/**
 * Resolves each stream's glyph style from `--output-style`, then `CODEASSEMBLY_OUTPUT_STYLE`, then the stream's own
 * terminal state, and exits with a usage error when either source names no style.
 */
function configureStreamStyles(): void {
  const stdout = resolveStreamStyle(process.stdout.isTTY);
  const stderr = resolveStreamStyle(process.stderr.isTTY);
  configureOutputStyle({ stderr: stderr.style, stdout: stdout.style });
  if (stdout.invalid !== undefined) {
    console.error(`Error: ${describeInvalidOutputStyle(stdout.invalid)}`);
    process.exit(1);
  }
}

function isValidHarness(value: string): value is HarnessId | 'all' {
  return VALID_HARNESS_IDS.has(value);
}

/** Parses CLI arguments into a structured options object. */
function parseArgs(argv: ReadonlyArray<string>): {
  command: string;
  subcommand: string;
  options: InstallOptions;
  check: boolean;
  content: string | undefined;
  help: boolean;
  global: boolean;
  warnOnly: boolean;
} {
  const args = argv.slice(2);
  let command = '';
  let subcommand = '';
  let check = false;
  let content: string | undefined;
  let harness: InstallOptions['harness'] = 'all';
  let link = false;
  let force = false;
  let dryRun = false;
  let hooks = true;
  let print = false;
  let help = false;
  let global = false;
  let warnOnly = false;
  let shouldOverrideWriter = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    const flag = parseFlag(arg);
    switch (flag) {
      case 'check':
        check = true;
        break;
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
      case 'skip-hooks':
        hooks = false;
        break;
      case 'print':
        print = true;
        break;
      case 'global':
        global = true;
        break;
      case 'override-writer':
        shouldOverrideWriter = true;
        break;
      case 'warn-only':
        warnOnly = true;
        break;
      case 'content': {
        const result = parseValueArg(args, i, '--content', '<dir>');
        content = result.value;
        i = result.nextIndex;
        break;
      }
      case 'output-style':
        // `configureStreamStyles` has already validated the value; only the spaced form consumes the next argument.
        if (!arg.includes('=')) i = parseValueArg(args, i, '--output-style', 'auto, plain, rich').nextIndex;
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
    options: { harness, link, force, dryRun, hooks, print, shouldOverrideWriter },
    check,
    content,
    help,
    global,
    warnOnly,
  };
}

type FlagName =
  | 'check'
  | 'content'
  | 'dry-run'
  | 'force'
  | 'global'
  | 'harness'
  | 'help'
  | 'link'
  | 'output-style'
  | 'override-writer'
  | 'print'
  | 'skip-hooks'
  | 'warn-only';

function parseFlag(arg: string): FlagName | null {
  if (arg.startsWith('--output-style=')) return 'output-style';
  const flags: Record<string, FlagName> = {
    '--help': 'help',
    '-h': 'help',
    '--link': 'link',
    '--force': 'force',
    '--dry-run': 'dry-run',
    '--skip-hooks': 'skip-hooks',
    '--print': 'print',
    '--global': 'global',
    '--override-writer': 'override-writer',
    '--warn-only': 'warn-only',
    '--check': 'check',
    '--content': 'content',
    '--harness': 'harness',
    '--output-style': 'output-style',
  };
  return flags[arg] ?? null;
}

function parseHarnessArg(
  args: ReadonlyArray<string>,
  index: number,
): { harness: HarnessId | 'all'; nextIndex: number } {
  const { value, nextIndex } = parseValueArg(args, index, '--harness', HARNESS_ARG_LIST);
  if (!isValidHarness(value)) {
    console.error(`Error: Invalid harness "${value}". Valid options: ${HARNESS_ARG_LIST}`);
    process.exit(1);
  }
  return { harness: value, nextIndex };
}

/** Reads the value following a value-taking flag, exiting with an attributed error when the flag stands alone. */
function parseValueArg(
  args: ReadonlyArray<string>,
  index: number,
  flag: string,
  expected: string,
): { value: string; nextIndex: number } {
  const nextArg = args[index + 1];
  if (!nextArg || nextArg.startsWith('--')) {
    console.error(`Error: ${flag} requires a value (${expected})`);
    process.exit(1);
  }
  return { value: nextArg, nextIndex: index + 1 };
}

/**
 * Prints usage information to stdout.
 */
function printUsage(): void {
  console.info(`Usage: codeassembly <command> [options]

Commands:
  install          Install shared guidance, harness-specific skills, scripts, and support data into harness directories
  configure-hooks  Write the session-lifecycle hook entries into harness configs (also run by install; see --print)
  init             Scaffold .agents/codeassembly.yaml (or --global for ~/.agents/codeassembly.yaml)
  sync             Resolve .agents/codeassembly.yaml and materialize declared rulebooks, skills, and subagents
  uninstall        Remove installed guidance, skills, subagents, and hook entries
  sizes            Rank the last recorded deployment's documents by size, with the context aggregates beneath them
  status           Show the current state of installed items, including hook entries
  validate         Check a content root for defects that reach a consumer; writes nothing
  bundle-helpers   Bundle the helpers declared by a content root's manifest (needs the optional esbuild peer)
  library list     List available library artifacts (rulebooks, skills, subagents)
  generate <target> Generate a configuration file (e.g., label-map)

Options:
  --content <dir>   Content root to act on; defaults to codeassembly.content in ./package.json (validate and bundle-helpers)
  --check           Fail on a bundle that differs from a fresh build, is not recorded at HEAD, or has no helper; writes nothing (bundle-helpers only)
  --harness <name>  Target harness: ${HARNESS_ARG_LIST} (default: all)
  --link             Use symlinks instead of copies (install only)
  --force            Overwrite or remove modified files (install/uninstall)
  --dry-run          Show what would be done without making changes (install, sync, init)
  --skip-hooks       Leave harness configs untouched during install (install only)
  --print            Print the hook entries instead of writing them (configure-hooks only)
  --global           Target the user-global tier (~/.agents/codeassembly.yaml) in the home; applies to sync and init, and reads the home deployment's record under sizes
  --output-style <auto|plain|rich>  Print status glyphs as emoji (rich) or words (plain); auto (default) prints plain off a terminal, in CI, or under TERM=linux. Overrides CODEASSEMBLY_OUTPUT_STYLE
  --override-writer  Write the home domain from an installation not designated by \`home-writer\` (install and sync --global only)
  --warn-only        Report a failure and exit 0 instead of failing (sync only; for lifecycle hooks)
  --help, -h         Show this help message`);
}

/**
 * Reports a failed sync and what the failure leaves in effect. A defect list is rendered as its own block: It is a
 * list of findings rather than one failure, and the `Error:` prefix would present it as the latter.
 */
function reportSyncFailure(error: unknown): void {
  if (isSyncValidationError(error)) {
    emitReport([
      { level: 'error', text: '' },
      { glyph: 'failed', level: 'error', text: `sync found ${error.defects.length} defect(s):` },
      { level: 'error', text: '' },
    ]);
    console.error(formatContentDefects(error.defects));
  } else {
    console.error(`Error: ${describeError(error)}`);
  }
  console.error(`\n${SYNC_FAILURE_EFFECT}`);
}

/** Resolves the glyph style of a stream whose terminal state is `isTty`, from the invocation and the environment. */
function resolveStreamStyle(isTty: boolean): OutputStyleResolution {
  return resolveOutputStyle({
    argv: process.argv.slice(2),
    env: process.env,
    envVar: OUTPUT_STYLE_ENV_VAR,
    flag: '--output-style',
    isTty,
  });
}

/** Dispatches a `generate` target, printing that command's usage and exiting non-zero when the target is unknown. */
async function runGenerate(subcommand: string, options: InstallOptions): Promise<void> {
  if (subcommand !== 'label-map') {
    if (subcommand) console.error(`Error: Unknown generate target "${subcommand}"`);
    printGenerateUsage();
    process.exit(1);
  }
  await generateLabelMap({ force: options.force });
}

/** Dispatches a `library` subcommand, printing that command's usage and exiting non-zero when it is unknown. */
async function runLibrary(subcommand: string): Promise<void> {
  if (subcommand !== 'list') {
    if (subcommand) console.error(`Error: Unknown library subcommand "${subcommand}"`);
    printLibraryUsage();
    process.exit(1);
  }
  await libraryListCommand();
}

/**
 * Dispatches sync to the requested domain. Under `warnOnly`, a failure is reported and the process still exits 0 --
 * the posture that a package-manager lifecycle hook needs, because aborting the install is far more disruptive than stale
 * guidance. The default exits 1, so an explicitly invoked sync still fails closed on every guard raised by the
 * command.
 */
async function runSync(options: InstallOptions, global: boolean, warnOnly: boolean): Promise<void> {
  try {
    const outcome = await (global ? syncGlobalCommand(options) : syncCommand(options));
    emitReport(options.dryRun ? renderDryRunReport(outcome) : renderSyncReport(outcome));
  } catch (error: unknown) {
    if (warnOnly) {
      printLine({
        glyph: 'warning',
        level: 'warn',
        text: `sync failed: ${describeError(error)}\n${SYNC_FAILURE_EFFECT}`,
      });
      return;
    }
    reportSyncFailure(error);
    process.exit(1);
  }
}

// endregion | Helpers

await main();
