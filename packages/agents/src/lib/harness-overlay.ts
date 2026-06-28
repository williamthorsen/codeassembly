import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isEnoent } from './type-guards.ts';
import type { HarnessConfig } from './types.ts';

/**
 * Reads a harness's overlay YAML, returning an empty string when the file is absent. The overlay lives under
 * `subagents/_data/` but is harness-level: it carries both the subagent frontmatter `_defaults`/per-agent merge and the
 * shared `{tool:NAME}` mapping, so the skill and subagent deploy paths load it alike.
 */
export async function loadHarnessOverlay(contentDir: string, harnessConfig: HarnessConfig): Promise<string> {
  const overlayPath = path.join(contentDir, 'subagents', '_data', harnessConfig.frontmatterFile);
  try {
    return await readFile(overlayPath, 'utf8');
  } catch (error: unknown) {
    if (!isEnoent(error)) {
      throw error;
    }
    return '';
  }
}
