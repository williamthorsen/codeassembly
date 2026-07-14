import { z } from 'zod';

import { CONTENT_DIR } from '../layout/index.ts';

/**
 * The on-disk `.kb/config.yaml` shape. Both fields are optional so a file may override only the dimension it cares
 * about; an absent field falls back to {@link defaultKbConfig}.
 */
export const configFileShape = z.object({
  targets: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});

/** The effective check configuration: the glob target set and the glob exclude set. */
export interface KbConfig {
  /** Glob patterns (slash-separated, kbRoot-relative) selecting which notes `check` enumerates. */
  targets: readonly string[];
  /** Glob patterns excluded from enumeration even when a target matches. */
  exclude: readonly string[];
}

/**
 * The configuration applied when `.kb/config.yaml` is absent or omits a field. Targets the `content/`-scoped layout
 * the owner's stores use; with `picomatch` `dot:false`, dot-directories (`.kb`, `.git`, `.agents`) are excluded
 * implicitly, so the default exclude only names `node_modules`.
 */
export const defaultKbConfig: KbConfig = {
  targets: [`${CONTENT_DIR}/**/*.md`],
  exclude: ['**/node_modules/**'],
};
