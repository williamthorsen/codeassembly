import { access } from 'node:fs/promises';
import path from 'node:path';

/** The base directories whose `.agents/` tier files compose a scope chain. Slice 1 resolves the project only. */
interface ScopeChainOptions {
  readonly cwd: string;
}

/**
 * Resolves the ordered chain of existing config files named `filename` across the supported tiers, lowest to
 * highest precedence. Slice 1 walks two tiers, both under `<cwd>/.agents/`: the committed project file
 * (`<filename>`) and its gitignored project-local override (`<filename>` with `.local` inserted before the
 * extension). Only files that exist are returned, so a caller can treat the result as the exact set to combine.
 *
 * The tiers are a list this function walks, so adding the user-global (`~/.agents/`) and workspace tiers later is
 * data — a longer candidate list built from additional base dirs — not a change to callers. This is the shared
 * "resolve the chain, not a single file" helper that the preferences reader adopts in a later slice.
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
