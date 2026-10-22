import type { BacklogGit } from './git.ts';
import type { CommandRunner } from './types.ts';

/** Everything a command reads from its environment, injected so that tests can supply fixtures. */
export interface CommandContext {
  git: BacklogGit;
  now: Date;
  root: string;
  run: CommandRunner;
  stdin: string;
}

/** A failure that a command reports as a structured result rather than throwing to `main`. */
export class CommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** A command's result: a success payload, or a structured failure that the helper reports at exit 0. */
export type CommandResult = { ok: false; error: string; message: string } | ({ ok: true } & Record<string, unknown>);
