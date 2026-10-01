import { readFile } from 'node:fs/promises';

import { describeError } from '@williamthorsen/toolbelt.errors';

import type { ContentDefect } from '../content-defects.ts';
import { listFilesRecursively } from '../fs-helpers.ts';
import { type RuleContext, toRootRelative } from './rule-context.ts';

/** Written as an escape: A literal non-breaking space is invisible in source. */
const NON_BREAKING_SPACE = '\u{A0}';

/** The authored extensions. A `.mjs` file is a build-written bundle, which the corpus does not author. */
const SCANNED_EXTENSIONS: ReadonlyArray<string> = ['.json', '.md', '.sh', '.ts', '.yaml'];

/**
 * Reports every line of an authored file under the root that contains a non-breaking space (U+00A0), one defect per
 * line. The ban is total rather than indent-only: The sole reason to type one into guidance is to indent a subordinate
 * line, and a blanket check does not need any parsing to decide.
 *
 * The scan decodes each file rather than matching bytes. Because 0xA0 is a continuation byte of characters such as
 * ■ (U+25A0) and ➕ (U+2795), a byte-level search would report every one of them.
 */
export async function findNonBreakingSpaceDefects({ root }: RuleContext): Promise<ReadonlyArray<ContentDefect>> {
  const defects: Array<ContentDefect> = [];
  const files = await listFilesRecursively(root, SCANNED_EXTENSIONS);
  for (const file of files) {
    const relativePath = toRootRelative(root, file);
    let body: string;
    try {
      body = await readFile(file, 'utf8');
    } catch (error: unknown) {
      defects.push({ file: relativePath, kind: 'codepoint', detail: describeError(error) });
      continue;
    }
    if (!body.includes(NON_BREAKING_SPACE)) {
      continue;
    }

    for (const [index, line] of body.split('\n').entries()) {
      if (line.includes(NON_BREAKING_SPACE)) {
        defects.push({
          file: relativePath,
          kind: 'codepoint',
          detail:
            `Line ${index + 1} contains a non-breaking space (U+00A0). A whitespace indent does not survive terminal ` +
            'rendering; the line collapses to the left margin and the reader cannot tell which option its reasoning ' +
            'belongs to. Nest the reasoning as a list item instead.',
        });
      }
    }
  }
  return defects;
}
