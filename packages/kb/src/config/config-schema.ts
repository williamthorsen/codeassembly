import { z } from 'zod';

import { CONTENT_DIR } from '../layout/index.ts';

/**
 * The on-disk `.kb/config.yaml` shape. Every field is optional so a file may override only the key it cares about; an
 * absent field falls back to {@link defaultKbConfig}.
 */
export const configFileShape = z.object({
  targets: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  visibility: z.enum(['private', 'shared']).optional(),
});

/**
 * The configuration applied when `.kb/config.yaml` is absent or omits a field. Targets the `content/`-scoped layout
 * the owner's stores use; with `picomatch` `dot:false`, dot-directories (`.kb`, `.git`, `.agents`) are excluded
 * implicitly, so the default exclude only names `node_modules`. Visibility defaults to the safer of the two values, so
 * a store that has not declared itself never widens what may link into it.
 */
export const defaultKbConfig: KbConfig = {
  targets: [`${CONTENT_DIR}/**/*.md`],
  exclude: ['**/node_modules/**'],
  visibility: 'private',
};

/**
 * Whether a link from a store of `source` visibility may resolve into one of `target` visibility. A link never
 * increases disclosure: it may point at a store as shareable as its own or more so, never at a less shareable one.
 */
export function isAtLeastAsShareable(input: { source: StoreVisibility; target: StoreVisibility }): boolean {
  return VISIBILITY_RANK[input.target] >= VISIBILITY_RANK[input.source];
}

/** The effective check configuration: the glob target set, the glob exclude set, and the store's visibility. */
export interface KbConfig {
  /** Glob patterns (slash-separated, kbRoot-relative) selecting which notes `check` enumerates. */
  targets: readonly string[];
  /** Glob patterns excluded from enumeration even when a target matches. */
  exclude: readonly string[];
  /** How widely the store is published, which decides what may link into it. */
  visibility: StoreVisibility;
}

/** How widely a store is published: `shared` reaches collaborators through a remote, `private` reaches nobody else. */
export type StoreVisibility = NonNullable<z.infer<typeof configFileShape>['visibility']>;

// region | Helpers

/** Orders the visibility values so a link's direction is a numeric comparison. */
const VISIBILITY_RANK: Record<StoreVisibility, number> = {
  private: 0,
  shared: 1,
};

// endregion | Helpers
