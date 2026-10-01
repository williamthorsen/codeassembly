import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import type { ContentDefect } from '../content-defects.ts';
import { expandIncludes } from '../directive-expander.ts';
import { listMarkdownFilesRecursively } from '../fs-helpers.ts';
import { MARKDOWN_LINK_REGEX } from '../path-rewriter.ts';
import { type RuleContext, toRootRelative } from './rule-context.ts';

/** The targets that resolve without depending on where the file is written. */
const PLACE_INDEPENDENT_TARGET = /^(?:https?:\/\/|\/|~\/|#)/;

/**
 * Reports each bare-relative Markdown link target in the include-expanded body of a file under `guidance/shared/`.
 * Shared guidance is inlined into each harness's flat guidance file, where a link resolves against the destination
 * rather than the source tree, so a source-relative target points at nothing. A skill is referenced by name instead.
 */
export async function findSharedGuidanceLinkDefects({ root }: RuleContext): Promise<ReadonlyArray<ContentDefect>> {
  const defects: Array<ContentDefect> = [];
  const files = await listMarkdownFilesRecursively(path.join(root, 'guidance', 'shared'));
  for (const file of files) {
    const relativePath = toRootRelative(root, file);
    let expanded: string;
    try {
      expanded = await expandIncludes(file, root);
    } catch (error: unknown) {
      defects.push({ file: relativePath, kind: 'link', detail: describeError(error) });
      continue;
    }
    for (const match of expanded.matchAll(MARKDOWN_LINK_REGEX)) {
      const target = match[2];
      if (target !== undefined && !PLACE_INDEPENDENT_TARGET.test(target)) {
        defects.push({
          file: relativePath,
          kind: 'link',
          detail:
            `Links to \`${target}\`, a relative target, but shared guidance is inlined into each harness's ` +
            'guidance file, where the target names nothing. Name the skill that carries the convention instead.',
        });
      }
    }
  }
  return defects;
}
