import { randomBytes } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';

import { renderFrontmatterFields } from './yaml-fields.ts';

const FENCE = '---';

/**
 * Renders a field map and body to note content: the opening fence, the frontmatter, the closing fence, one blank line,
 * then the body. A single leading newline on the body is dropped so the blank line is not doubled, keeping the output
 * stable across read/write cycles.
 */
export function renderNote(fields: Record<string, unknown>, body: string): string {
  const frontmatter = renderFrontmatterFields(fields);
  const normalizedBody = body.startsWith('\n') ? body.slice(1) : body;
  return `${FENCE}\n${frontmatter}\n${FENCE}\n\n${normalizedBody}`;
}

/**
 * Atomically writes a note to `path` via a same-directory temp file plus `rename`, so a concurrent reader never sees a
 * partial write. On rename failure the temp file is cleaned up best-effort and the error re-thrown.
 */
export async function writeNote(path: string, fields: Record<string, unknown>, body: string): Promise<void> {
  const content = renderNote(fields, body);
  const tempPath = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(tempPath, content, 'utf8');
  try {
    await rename(tempPath, path);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // The rename failure is what the caller needs; a failed cleanup must not mask it.
    }
    throw error;
  }
}
