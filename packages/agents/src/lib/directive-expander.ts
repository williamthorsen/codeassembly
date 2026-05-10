import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Matches a self-closing include directive on its own line: `<!-- include: path / -->`.
 * The captured group is the path target. Self-close must be tested before the open
 * pattern to prevent a path-with-trailing-slash from being misread as an open directive.
 */
const SELF_CLOSE_REGEX = /^[ \t]*<!--[ \t]*include:[ \t]*(\S+?)[ \t]*\/[ \t]*-->[ \t]*$/;

/**
 * Matches a closing include directive on its own line: `<!-- /include -->`.
 */
const CLOSE_REGEX = /^[ \t]*<!--[ \t]*\/include[ \t]*-->[ \t]*$/;

/**
 * Matches an opening include directive on its own line: `<!-- include: path -->`.
 * The captured group is the path target. Tested after self-close to disambiguate.
 */
const OPEN_REGEX = /^[ \t]*<!--[ \t]*include:[ \t]*(\S+)[ \t]*-->[ \t]*$/;

/**
 * Matches the children-slot placeholder line inside a partial: `<!-- children -->`.
 */
const CHILDREN_PLACEHOLDER_REGEX = /^[ \t]*<!--[ \t]*children[ \t]*-->[ \t]*$/;

/**
 * Matches a directive that uses `include:` syntax but does not match any recognized shape
 * (self-close, open, close). Used to reject unrecognized parameters with a structured error.
 */
const ANY_INCLUDE_LIKE_REGEX = /^[ \t]*<!--[ \t]*include:[ \t]*.*-->[ \t]*$/;

/** Reason an include directive failed to resolve, surfaced in error messages. */
type FailureReason =
  | 'cycle'
  | 'not-found'
  | 'orphan-close'
  | 'out-of-tree'
  | 'slot-without-children'
  | 'unclosed-open'
  | 'unrecognized-parameter';

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
 * Recursively expands include directives in a markdown file. Three directive shapes are
 * supported: self-close (`<!-- include: path / -->`), open (`<!-- include: path -->`)
 * paired with close (`<!-- /include -->`), and the `<!-- children -->` slot placeholder
 * inside a partial. Resolution is anchored to the source tree: each directive's path is
 * resolved against the directive-bearing file's directory, and resolved paths must remain
 * under `contentDir`. Throws `DirectiveExpansionError` for missing targets, out-of-tree
 * paths, include cycles, malformed directives, and slot/children mismatches.
 */
export async function expandIncludes(filePath: string, contentDir: string): Promise<string> {
  const visited = new Set<string>();
  return expandFile(path.resolve(filePath), path.resolve(contentDir), visited);
}

/** A frame on the open-directive stack tracking an unclosed open directive. */
interface OpenFrame {
  readonly target: string;
  readonly resolved: string;
  readonly lineNumber: number;
  readonly slotLines: Array<string>;
}

async function expandFile(filePath: string, contentDir: string, visited: Set<string>): Promise<string> {
  if (visited.has(filePath)) {
    const cyclePath = [...visited, filePath].join(' -> ');
    throw new DirectiveExpansionError(`Include directive cycle detected: ${cyclePath}`, 'cycle');
  }
  visited.add(filePath);

  try {
    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n');
    const out: Array<string> = [];
    const stack: Array<OpenFrame> = [];

    for (const [i, line] of lines.entries()) {
      const lineNumber = i + 1;

      // Match in priority order: self-close, close, open. Self-close must precede open
      // because both can match a path; the slash disambiguates.
      const selfCloseMatch = SELF_CLOSE_REGEX.exec(line);
      const closeMatch = selfCloseMatch ? null : CLOSE_REGEX.exec(line);
      const openMatch = selfCloseMatch || closeMatch ? null : OPEN_REGEX.exec(line);

      const selfCloseTarget = selfCloseMatch?.[1];
      if (selfCloseTarget !== undefined) {
        const resolved = resolveTarget(filePath, contentDir, selfCloseTarget, lineNumber);
        const expanded = await expandPartialWithSlot(resolved, contentDir, visited, [], filePath, lineNumber);
        appendLines(stack, out, expanded, filePath);
        continue;
      }

      if (closeMatch) {
        const frame = stack.pop();
        if (!frame) {
          throw new DirectiveExpansionError(
            `Orphan close directive (no matching open): ${filePath}:${lineNumber} reason=orphan-close`,
            'orphan-close',
          );
        }
        const expanded = await expandPartialWithSlot(
          frame.resolved,
          contentDir,
          visited,
          frame.slotLines,
          filePath,
          frame.lineNumber,
        );
        appendLines(stack, out, expanded, filePath);
        continue;
      }

      const openTarget = openMatch?.[1];
      if (openTarget !== undefined) {
        const resolved = resolveTarget(filePath, contentDir, openTarget, lineNumber);
        stack.push({ target: openTarget, resolved, lineNumber, slotLines: [] });
        continue;
      }

      // If the line looks like an include directive but matched none of the recognized
      // shapes, reject it as an unrecognized parameter. This catches typos like
      // `<!-- include: path foo -->` or `<!-- include: path /bar -->`.
      if (ANY_INCLUDE_LIKE_REGEX.test(line)) {
        throw new DirectiveExpansionError(
          `Include directive has unrecognized parameter: ${filePath}:${lineNumber} line="${line}" reason=unrecognized-parameter`,
          'unrecognized-parameter',
        );
      }

      // Plain content line. If we're inside an open directive, accumulate it into the slot;
      // otherwise emit it directly.
      appendLines(stack, out, [line], filePath);
    }

    if (stack.length > 0) {
      // `stack.length > 0` guarantees a frame exists; assert-style guard keeps the
      // invariant explicit for future readers without producing a silently swallowed branch.
      const frame = stack.at(-1);
      if (frame === undefined) {
        throw new Error(`Invariant violation: stack.length > 0 but stack[-1] is undefined in ${filePath}`);
      }
      throw new DirectiveExpansionError(
        `Unclosed open directive: ${filePath}:${frame.lineNumber} target="${frame.target}" reason=unclosed-open`,
        'unclosed-open',
      );
    }

    return out.join('\n');
  } finally {
    visited.delete(filePath);
  }
}

/**
 * Resolves a target path against the directive-bearing file's directory and validates
 * that the resolved path is contained within `contentDir` and exists on disk.
 */
function resolveTarget(filePath: string, contentDir: string, target: string, lineNumber: number): string {
  const resolved = path.resolve(path.dirname(filePath), target);

  // Lexical containment check. Symlinks under contentDir that point outside are not realpath'd
  // — source trees are not expected to contain symlinks; widen this guard if that changes.
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

  return resolved;
}

/**
 * Expands a partial file and substitutes its `<!-- children -->` placeholder with the
 * caller's slot content (recursively expanded). Returns the expanded partial as an array
 * of lines (no trailing-newline normalization). Throws `slot-without-children` when the
 * caller provided slot content but the partial has no placeholder.
 */
async function expandPartialWithSlot(
  partialPath: string,
  contentDir: string,
  visited: Set<string>,
  slotLines: ReadonlyArray<string>,
  callerPath: string,
  callerLineNumber: number,
): Promise<Array<string>> {
  // Recursively expand the partial body; this resolves nested includes within the partial.
  const partialBody = await expandFile(partialPath, contentDir, visited);
  const partialLines = partialBody.split('\n');

  // Locate the `<!-- children -->` placeholder. There may be at most one; multiple
  // are not currently used and would substitute identically — we substitute the first.
  let placeholderIndex = -1;
  for (const [idx, line] of partialLines.entries()) {
    if (CHILDREN_PLACEHOLDER_REGEX.test(line)) {
      placeholderIndex = idx;
      break;
    }
  }

  if (placeholderIndex === -1) {
    if (slotLines.length > 0) {
      throw new DirectiveExpansionError(
        `Include directive provided slot content, but partial has no <!-- children --> placeholder: ${callerPath}:${callerLineNumber} target="${path.relative(contentDir, partialPath)}" reason=slot-without-children`,
        'slot-without-children',
      );
    }
    // No placeholder, no slot content — trim a single trailing blank line from the
    // partial's split result so an included file ending in a newline does not introduce
    // a stray blank line at the host's expansion site.
    return trimTrailingEmptyLine(partialLines);
  }

  // Substitute: remove the placeholder line and insert the (possibly empty) slot lines
  // verbatim in its place.
  const result: Array<string> = [
    ...partialLines.slice(0, placeholderIndex),
    ...slotLines,
    ...partialLines.slice(placeholderIndex + 1),
  ];
  return trimTrailingEmptyLine(result);
}

/**
 * Routes lines either to the top of the open-frame stack (accumulating slot content) or
 * to the output buffer when no frame is open. `filePath` is included in invariant-failure
 * messages so a runaway invariant violation points at the file under expansion.
 */
function appendLines(
  stack: Array<OpenFrame>,
  out: Array<string>,
  linesToAppend: ReadonlyArray<string>,
  filePath: string,
): void {
  if (stack.length === 0) {
    out.push(...linesToAppend);
    return;
  }
  // `stack.length > 0` guarantees a frame exists; assert-style guard keeps the invariant
  // explicit for future readers without producing a silently swallowed branch.
  const top = stack.at(-1);
  if (top === undefined) {
    throw new Error(`Invariant violation: stack.length > 0 but stack[-1] is undefined in ${filePath}`);
  }
  top.slotLines.push(...linesToAppend);
}

/**
 * Drops a single trailing empty string produced by `split('\n')` on a file ending with
 * a newline. This preserves the previous expander's behavior: an included file with a
 * trailing newline does not introduce a stray blank line at the host's expansion site.
 */
function trimTrailingEmptyLine(lines: ReadonlyArray<string>): Array<string> {
  if (lines.length > 0 && lines.at(-1) === '') {
    return lines.slice(0, -1);
  }
  return [...lines];
}
