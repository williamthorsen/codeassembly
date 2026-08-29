import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isEnoent } from './type-guards.ts';
import type { HarnessConfig } from './types.ts';

/**
 * Reads the subagent frontmatter overlay one harness applies to the content root at `contentDir`, returning an empty
 * string when the file is absent. A root shipping no overlay therefore contributes no `_defaults` and no per-agent
 * override, which is what makes the merge source-scoped.
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
