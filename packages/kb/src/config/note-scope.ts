import picomatch from 'picomatch';

import type { KbConfig } from './config-schema.ts';

/** The note-membership predicates a {@link KbConfig} defines, all matching KB-root-relative, slash-separated paths. */
export interface NoteScopeMatcher {
  /** True when the path matches a `targets` glob. */
  isTarget(relativePath: string): boolean;
  /** True when the path matches an `exclude` glob. */
  isExcluded(relativePath: string): boolean;
  /** True when the path is a note: matched by `targets` and not `exclude`d. The `.md` gate is the caller's. */
  isNote(relativePath: string): boolean;
}

/**
 * Builds the note-membership predicates for a KB config — the single definition of "a note" shared by
 * `enumerateNotes` (which `kb check`/`kb-curate` drive) and `kb-retrieve`. Both axes match with `picomatch`'s
 * `dot:false`, so dot-directories (`.kb`, `.git`, `.agents`) are excluded implicitly without naming them in `exclude`.
 *
 * The `.md` extension gate is deliberately left to the caller: `enumerateNotes` applies its own `.endsWith('.md')`
 * during the walk, and `kb-retrieve` constrains ripgrep with `--glob '*.md'`. Keeping it out of `isNote` lets this
 * matcher govern only the `targets`/`exclude` dimension, the one place the two tools previously disagreed.
 */
export function createNoteScopeMatcher(config: KbConfig): NoteScopeMatcher {
  const isTarget = picomatch([...config.targets], { dot: false });
  const isExcluded = picomatch([...config.exclude], { dot: false });
  return {
    isTarget,
    isExcluded,
    isNote: (relativePath) => isTarget(relativePath) && !isExcluded(relativePath),
  };
}
