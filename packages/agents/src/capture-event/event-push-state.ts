import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { buildEventPath } from '@codeassembly/kb/layout';

const execFileAsync = promisify(execFile);

/**
 * Reports whether an event has been pushed to the store's git remote, which is what makes it immutable. For a
 * git-backed KB, "pushed" means the event's file is present in the working tree's configured upstream (`@{upstream}`,
 * typically `origin/main`). The check asks git whether the event's file exists in that commit. `git push`
 * updates the local upstream ref, so this is an offline, fetch-free read of the last pushed state.
 *
 * Any indeterminate case — the store is not a git repository, has no upstream configured, or `git` is unavailable —
 * resolves to `false`, treating the event as unpushed and therefore editable. Immutability begins only at a confirmed
 * push.
 */
export async function isEventPushed(input: { storePath: string; id: string }): Promise<boolean> {
  // `@{upstream}` reads the branch's configured upstream rather than a fixed ref name, so a store tracking anything
  // other than `origin/main` is handled without special-casing.
  const objectPath = buildEventPath(input.id);
  try {
    await execFileAsync('git', ['-C', input.storePath, 'cat-file', '-e', `@{upstream}:${objectPath}`]);
    return true;
  } catch {
    return false;
  }
}
