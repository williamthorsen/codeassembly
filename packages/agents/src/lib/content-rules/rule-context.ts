import path from 'node:path';

import type { SourceResolver } from '../content-sources.ts';

/** What a content rule reads: the root under examination, and the resolver searching it. */
export interface RuleContext {
  readonly root: string;
  readonly resolver: SourceResolver;
}

/** Renders an absolute path under `root` as the root-relative POSIX path that a defect names. */
export function toRootRelative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}
