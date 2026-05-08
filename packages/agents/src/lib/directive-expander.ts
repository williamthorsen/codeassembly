import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Matches a build-time include directive that occupies an entire line, with optional leading and
 * trailing whitespace. The captured group is the path target, interpreted relative to the
 * directive-bearing file's directory in the source tree.
 */
const DIRECTIVE_REGEX = /^[ \t]*<!--[ \t]*include:[ \t]*(\S+)[ \t]*-->[ \t]*$/;

/** Reason an include directive failed to resolve, surfaced in error messages. */
type FailureReason = 'cycle' | 'not-found' | 'out-of-tree';

/**
 * Error thrown when an include directive cannot be resolved at install time.
 */
export class DirectiveExpansionError extends Error {
  readonly reason: FailureReason;

  constructor(message: string, reason: FailureReason) {
    super(message);
    this.name = 'DirectiveExpansionError';
    this.reason = reason;
  }
}

/**
 * Recursively expands `<!-- include: {source-relative-path} -->` directives in a markdown file.
 * Resolution is anchored to the source tree: each directive's path is resolved against the
 * directive-bearing file's directory, and resolved paths must remain under `contentDir`.
 * Throws `DirectiveExpansionError` for missing targets, out-of-tree paths, or include cycles.
 */
export async function expandIncludes(filePath: string, contentDir: string): Promise<string> {
  const visited = new Set<string>();
  return expandFile(path.resolve(filePath), path.resolve(contentDir), visited);
}

async function expandFile(filePath: string, contentDir: string, visited: Set<string>): Promise<string> {
  if (visited.has(filePath)) {
    const cyclePath = [...visited, filePath].join(' -> ');
    throw new DirectiveExpansionError(`Include directive cycle detected: ${cyclePath}`, 'cycle');
  }
  visited.add(filePath);

  const content = await readFile(filePath, 'utf8');
  const lines = content.split('\n');
  const out: Array<string> = [];

  for (const [i, line] of lines.entries()) {
    const match = DIRECTIVE_REGEX.exec(line);
    if (!match || match[1] === undefined) {
      out.push(line);
      continue;
    }

    const target = match[1];
    const lineNumber = i + 1;
    const resolved = path.resolve(path.dirname(filePath), target);

    const relative = path.relative(contentDir, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new DirectiveExpansionError(
        `Include directive resolves outside the content directory: ${filePath}:${lineNumber} target="${target}" resolved="${resolved}" reason=out-of-tree`,
        'out-of-tree',
      );
    }

    if (!existsSync(resolved)) {
      throw new DirectiveExpansionError(
        `Include directive target not found: ${filePath}:${lineNumber} target="${target}" resolved="${resolved}" reason=not-found`,
        'not-found',
      );
    }

    const included = await expandFile(resolved, contentDir, visited);
    const includedLines = included.split('\n');
    if (includedLines.length > 0 && includedLines[includedLines.length - 1] === '') {
      includedLines.pop();
    }
    out.push(...includedLines);
  }

  visited.delete(filePath);
  return out.join('\n');
}
