import path from 'node:path';

import { DEFAULT_ARTIFACT_BASE_DIR, resolveArtifactBaseDir } from '../derive-session-context/compose-manifest.ts';
import { readPreferences } from '../derive-session-context/read-preferences.ts';

/** Reports whether an absolute path lies inside the artifact base directory, whose files record a moment. */
export function isInsideArtifactBaseDir(absolutePath: string, artifactBaseDir: string): boolean {
  const relative = path.relative(artifactBaseDir, absolutePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Resolves the artifact base directory configured for a repository root, from the same preferences read by the
 * session-context deriver. A preferences file that cannot be read falls back to the documented default rather than
 * failing the caller, since the directory matters only where a repository keeps its artifacts in tree.
 */
export async function resolveRootArtifactBaseDir(root: string, home: string): Promise<string> {
  try {
    const { preferences } = await readPreferences({ cwd: root, home });
    return resolveArtifactBaseDir(preferences.artifacts?.base_dir ?? DEFAULT_ARTIFACT_BASE_DIR, root, home);
  } catch {
    return resolveArtifactBaseDir(DEFAULT_ARTIFACT_BASE_DIR, root, home);
  }
}
