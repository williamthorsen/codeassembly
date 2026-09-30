import type { Stats } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { DeclaredReference } from './codeassembly-manifest.ts';
import type { ContentDefect } from './content-defects.ts';
import { isFilesystemPath, locateInstalledPackage } from './package-sources.ts';
import { isMissingFile } from './type-guards.ts';

/** A declared reference located on disk: `target` is the absolute path through `node_modules`, not its realpath. */
export interface ResolvedReference {
  readonly name: string;
  readonly summary: string;
  readonly target: string;
}

/**
 * Resolves each declared reference to its target inside an installed dependency, or to a `resolution` defect attributed
 * to the declaring file. Every reference is checked, so one run reports every defect. Only existence is checked: the
 * target may be a file or a directory, and nothing is read from it.
 */
export async function resolveDeclaredReferences(
  references: ReadonlyArray<DeclaredReference>,
): Promise<{ resolved: ReadonlyArray<ResolvedReference>; defects: ReadonlyArray<ContentDefect> }> {
  const resolved: Array<ResolvedReference> = [];
  const defects: Array<ContentDefect> = [];
  for (const reference of references) {
    const outcome = await resolveReference(reference);
    if (typeof outcome === 'string') {
      defects.push({
        file: reference.declaredIn,
        kind: 'resolution',
        detail: `Reference "${reference.name}": ${outcome}`,
      });
    } else {
      resolved.push(outcome);
    }
  }
  return { resolved, defects };
}

// region | Helpers

/** Reports whether `target` is a directory, treating absence as `false` and rethrowing any other failure. */
async function isDirectory(target: string): Promise<boolean> {
  const stats = await statIfPresent(target);
  return stats?.isDirectory() ?? false;
}

/** Resolves one reference, or returns the reason that it does not resolve. */
async function resolveReference(reference: DeclaredReference): Promise<ResolvedReference | string> {
  if (!(await isDirectory(reference.resolveFrom))) {
    return `resolve-from ${reference.resolveFrom} is not a directory.`;
  }
  if (isFilesystemPath(reference.package)) {
    return `package "${reference.package}" is a filesystem path, not a package name.`;
  }

  const located = await locateInstalledPackage(reference.package, reference.resolveFrom);
  if (!('dir' in located)) {
    return `package "${reference.package}" is not installed. Searched: ${located.searched.join(', ')}.`;
  }

  const target = path.resolve(located.dir, reference.path);
  const relative = path.relative(located.dir, target);
  if (path.isAbsolute(reference.path) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    return `path "${reference.path}" is not inside package "${reference.package}".`;
  }
  // `stat` follows symlinks, so a pnpm-linked package resolves to the linked directory's content.
  if ((await statIfPresent(target)) === undefined) {
    return `path "${reference.path}" does not exist in package "${reference.package}" (${target}).`;
  }

  return { name: reference.name, summary: reference.summary, target };
}

/** Stats `target`, resolving to `undefined` when it is absent and rethrowing any other failure. */
async function statIfPresent(target: string): Promise<Stats | undefined> {
  try {
    return await stat(target);
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

// endregion | Helpers
