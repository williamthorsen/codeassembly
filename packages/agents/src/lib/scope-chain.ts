import { access } from 'node:fs/promises';
import path from 'node:path';

/** Base directories whose `.agents/` tier files compose the scope chain. */
interface ScopeChainOptions {
  readonly cwd: string;
}

/**
 * Resolves the ordered chain of existing config files named `filename`, lowest to highest precedence. Two tiers
 * are walked, both under `<cwd>/.agents/`: the committed project file (`<filename>`) and its gitignored
 * project-local override (`<filename>` with `.local` inserted before the extension). Only existing files are
 * returned, so the caller can treat the result as the exact set to combine.
 */
export async function resolveScopeChain(filename: string, options: ScopeChainOptions): Promise<ReadonlyArray<string>> {
  const agentsDir = path.join(options.cwd, '.agents');
  const candidates = [path.join(agentsDir, filename), path.join(agentsDir, localVariant(filename))];

  const present = await Promise.all(
    candidates.map(async (candidate) => ((await fileExists(candidate)) ? candidate : undefined)),
  );
  return present.filter((candidate): candidate is string => candidate !== undefined);
}

// region | Helpers

/** Resolves whether a path points at an accessible file or directory. */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Inserts `.local` before the filename's extension: `codeassembly.yaml` → `codeassembly.local.yaml`. */
function localVariant(filename: string): string {
  const extension = path.extname(filename);
  const base = filename.slice(0, filename.length - extension.length);
  return `${base}.local${extension}`;
}

// endregion | Helpers
