import { writeAtomic } from '../filesystem/write-atomic.ts';
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
 * Atomically writes a note to `path`, so a concurrent reader never sees a partial write. See {@link writeAtomic} for
 * the guarantee and its failure behavior.
 */
export async function writeNote(path: string, fields: Record<string, unknown>, body: string): Promise<void> {
  await writeAtomic(path, renderNote(fields, body));
}
