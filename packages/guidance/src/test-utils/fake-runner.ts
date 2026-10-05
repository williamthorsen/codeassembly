import type { CommandRunner } from '../groom-backlog/types.ts';

/** One call that a fake runner received. */
export interface RunnerCall {
  args: readonly string[];
  command: 'gh' | 'git';
}

/**
 * Builds a runner that answers each call from `respond` and records
 * every call. A response of `undefined` rejects the call, as a failing command would.
 */
export function buildFakeRunner(respond: (call: RunnerCall) => string | undefined): {
  calls: RunnerCall[];
  run: CommandRunner;
} {
  const calls: RunnerCall[] = [];
  const run: CommandRunner = (command, args) => {
    const call = { args, command };
    calls.push(call);
    const response = respond(call);
    return response === undefined
      ? Promise.reject(new Error(`fake runner: ${command} ${args.join(' ')} failed`))
      : Promise.resolve(response);
  };
  return { calls, run };
}
