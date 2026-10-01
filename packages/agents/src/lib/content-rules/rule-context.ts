import path from 'node:path';

import type { ContentDefect } from '../content-defects.ts';
import type { SourceResolver } from '../content-sources.ts';
import type { ResolvedRulebook } from '../rulebook-deploy.ts';
import type { ResolvedSkill } from '../skill-deploy.ts';
import type { ResolvedSubagent } from '../subagent-deploy.ts';

/** Every artifact reached from a content root's seeds, resolved against its owning source. */
export interface ResolvedArtifacts {
  readonly rulebooks: ReadonlyArray<ResolvedRulebook>;
  readonly skills: ReadonlyArray<ResolvedSkill>;
  readonly subagents: ReadonlyArray<ResolvedSubagent>;
  readonly defects: ReadonlyArray<ContentDefect>;
}

/**
 * What a content rule reads: the root under examination, the library behind it, the resolver searching both in that
 * order, and the artifacts that the root's seeds reached. A rule reports on files under `root` alone, and consults the
 * library only to resolve what a root file names.
 */
export interface RuleContext {
  readonly root: string;
  readonly libraryDir: string;
  readonly resolver: SourceResolver;
  readonly artifacts: ResolvedArtifacts;
}

/** Renders an absolute path under `root` as the root-relative POSIX path that a defect names. */
export function toRootRelative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/');
}
