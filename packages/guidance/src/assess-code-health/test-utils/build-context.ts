import type { TrackedDependencies } from '../check-tracked.ts';
import type { CommandContext } from '../cli.ts';
import { realSenseDependencies, type SenseDependencies } from '../sense.ts';

/** Builds a command context that runs real sensors and whose tracker dependencies throw unless the test replaces them. */
export function buildContext(
  root: string,
  overrides: { sense?: SenseDependencies; tracked?: Partial<TrackedDependencies> } = {},
): CommandContext {
  return {
    root,
    sense: overrides.sense ?? realSenseDependencies,
    tracked: {
      run: () => Promise.reject(new Error('gh must not run')),
      changedSince: () => {
        throw new Error('git must not run');
      },
      readFile: () => {
        throw new Error('no file may be read');
      },
      ...overrides.tracked,
    },
  };
}
