/**
 * Recognition and removal of the `<!-- guidance-hook: <name> -->` directive, the named slot a skill or subagent body
 * declares for the guidance a declaration binds to it. Every function is a pure string transform with no filesystem
 * access.
 *
 * The grammar mirrors the include directive's: a directive occupies a full line, tolerates surrounding whitespace, and
 * is never recognized inline, so a hook named in prose or a code span stays prose. It is disjoint from the reserved
 * `slot:` tokens `_partials/README.md` holds for future named-slot support, so neither grammar can absorb the other.
 *
 * A declared hook is inert until a binding fills it: every render seam strips the directive, which is what makes a hook
 * legal to declare and invisible in deployed output.
 */

/** Matches a guidance-hook directive on its own line: `<!-- guidance-hook: name -->`. The captured group is the name. */
const HOOK_DIRECTIVE_REGEX = /^[ \t]*<!--[ \t]*guidance-hook:[ \t]*(.*?)[ \t]*-->[ \t]*$/;

/**
 * Matches a full-line comment whose opening token is a near-miss of `guidance-hook:` — a plural `guidance-hooks:`, a
 * space for the hyphen, a different case, or the token with no name at all. Tested only once the directive pattern has
 * failed, so a well-formed directive never reaches it.
 *
 * The plural is the likeliest miss, because `guidance-hooks:` is the key a declaration binds under, so an author moving
 * between the two spellings has nothing but this to tell them which one they wrote. The trailing group admits a payload
 * only behind a colon, which keeps prose that merely mentions a guidance hook from reading as an attempt to declare one.
 */
const HOOK_LIKE_REGEX = /^[ \t]*<!--[ \t]*guidance[ \t-]?hooks?[ \t]*(?::[^>]*)?-->[ \t]*$/i;

/** The kebab-case, letter-led slug grammar a hook name must satisfy, matching every other slug in the system. */
const HOOK_NAME_REGEX = /^[a-z][a-z0-9-]*$/;

/** Reason a body's guidance-hook declarations were rejected, surfaced in error messages. */
type FailureReason = 'duplicate-hook' | 'malformed-name' | 'unrecognized-directive';

/** A guidance-hook declaration in a body: the slot name and the 1-based line its directive occupies. */
export interface GuidanceHookDeclaration {
  readonly name: string;
  readonly lineNumber: number;
}

/**
 * Error thrown when a body's guidance-hook directives cannot be honored. Raised from the render pass, so `validate`
 * reports it as a defect and `sync` fails the run.
 */
export class GuidanceHookError extends Error {
  override readonly name = 'GuidanceHookError';
  readonly reason: FailureReason;

  constructor(message: string, reason: FailureReason) {
    super(message);
    this.reason = reason;
  }
}

/**
 * Reports whether `value` satisfies the grammar a guidance-hook name must take. Exported so a declaration binding to a
 * hook is held to the grammar the directive declaring it already enforces, without a second copy of the pattern.
 */
export function isGuidanceHookName(value: string): boolean {
  return HOOK_NAME_REGEX.test(value);
}

/**
 * Collects every guidance hook `body` declares, in source order. Throws `GuidanceHookError` for a name outside the slug
 * grammar, for a line that misses the directive shape while plainly reaching for it, and for a hook declared twice,
 * each anchored to `sourceLabel` and the offending line.
 *
 * A duplicate is rejected rather than collapsed because a binding fills a hook by name: two slots of one name have no
 * defined fill order and no way for an author to tell which one received the guidance.
 */
export function listGuidanceHooks(body: string, sourceLabel: string): ReadonlyArray<GuidanceHookDeclaration> {
  const declarations: Array<GuidanceHookDeclaration> = [];
  const firstLineByName = new Map<string, number>();

  for (const [index, line] of body.split('\n').entries()) {
    const name = HOOK_DIRECTIVE_REGEX.exec(line)?.[1];
    if (name === undefined) {
      if (HOOK_LIKE_REGEX.test(line)) {
        throw new GuidanceHookError(
          `Line reaches for the guidance-hook directive but misses its shape: ${sourceLabel}:${index + 1} ` +
            `line="${line.trim()}" reason=unrecognized-directive. The directive is \`<!-- guidance-hook: name -->\`.`,
          'unrecognized-directive',
        );
      }
      continue;
    }

    const lineNumber = index + 1;
    if (!HOOK_NAME_REGEX.test(name)) {
      throw new GuidanceHookError(
        `Guidance-hook directive names a malformed hook: ${sourceLabel}:${lineNumber} name="${name}" ` +
          'reason=malformed-name. A hook name is kebab-case and letter-led.',
        'malformed-name',
      );
    }

    const firstLine = firstLineByName.get(name);
    if (firstLine !== undefined) {
      throw new GuidanceHookError(
        `Guidance hook declared twice: ${sourceLabel}:${lineNumber} name="${name}" ` +
          `firstDeclaredAt=${firstLine} reason=duplicate-hook`,
        'duplicate-hook',
      );
    }

    firstLineByName.set(name, lineNumber);
    declarations.push({ name, lineNumber });
  }

  return declarations;
}

/**
 * Removes every guidance-hook directive line from `body`, joining the surrounding lines verbatim — the removal
 * semantics `<!-- children -->` already uses, so an author spaces a directive the way they space an include.
 * Throws whatever `listGuidanceHooks` rejects, which is what puts the grammar's gate on every render path.
 */
export function stripGuidanceHooks(body: string, sourceLabel: string): string {
  // Listing validates: a malformed name or a duplicate declaration fails the render rather than stripping silently.
  listGuidanceHooks(body, sourceLabel);

  return body
    .split('\n')
    .filter((line) => !HOOK_DIRECTIVE_REGEX.test(line))
    .join('\n');
}
