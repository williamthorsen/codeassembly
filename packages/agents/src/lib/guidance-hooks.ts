import { assertAnchorsResolve } from './anchor-resolution.ts';
import { renderRulebookBlock } from './sentinel-inliner.ts';

/**
 * Recognition, removal, and filling of the `<!-- guidance-hook: <name> -->` directive, the named slot a skill or
 * subagent body declares for the guidance a declaration binds to it. Every function is a pure string transform with no
 * filesystem access.
 *
 * The grammar mirrors the include directive's: a directive occupies a full line, tolerates surrounding whitespace, and
 * is never recognized inline, so a hook named in prose or a code span stays prose. It is disjoint from the reserved
 * `slot:` tokens `_partials/README.md` holds for future named-slot support, so neither grammar can absorb the other.
 *
 * A declared hook is inert until a binding fills it. A seam that resolves no declaration strips the directive, which is
 * what makes a hook legal to declare and invisible in deployed output; a seam that does passes the fills through and
 * splices the bound guidance in its place.
 */

/** A fenced code block's opening or closing marker: three or more backticks, or three or more tildes. */
const FENCE_REGEX = /^\s*(`{3,}|~{3,})/;

/** An ATX heading, captured so demotion can add a level without disturbing the text that follows. */
const HEADING_REGEX = /^(#{1,6})(\s)/;

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

/** The fills a seam resolving no declaration passes, so every hook it meets strips. */
const NO_FILLS: GuidanceHookFills = new Map();

/** Reason a body's guidance-hook declarations were rejected, surfaced in error messages. */
type FailureReason = 'duplicate-hook' | 'fill-in-frontmatter' | 'malformed-name' | 'unrecognized-directive';

/**
 * A body with its guidance hooks resolved. `content` carries the fills; `stripped` is the same body with every
 * directive removed and nothing spliced; `filled` names each hook that received guidance, in source order.
 *
 * Both bodies are returned because an anchor failure on `content` alone cannot say whose fault it is. Re-checking
 * `stripped` separates a collision a binding introduced from one the host carried all along.
 */
export interface FilledBody {
  readonly content: string;
  readonly stripped: string;
  readonly filled: ReadonlyArray<FilledHook>;
}

/** One guidance hook that received a fill: the hook's name and the rulebooks that filled it, in order. */
export interface FilledHook {
  readonly hook: string;
  readonly slugs: ReadonlyArray<string>;
}

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

/** One rulebook bound to a guidance hook: the slug its block is attributed to, and its already-rendered body. */
export interface GuidanceHookFill {
  readonly slug: string;
  readonly body: string;
}

/**
 * The rulebooks bound to each guidance hook, keyed by hook name and ordered as they fill. An absent key is an unbound
 * hook, which is why a seam that resolves no declaration passes an empty map and strips every hook it meets.
 */
export type GuidanceHookFills = ReadonlyMap<string, ReadonlyArray<GuidanceHookFill>>;

/**
 * Throws when an anchor-only link target in a filled body names no heading, or more than one, attributing the failure
 * to a binding when the host resolves without its fills. Every fillable seam calls this in place of a bare anchor
 * assert, so the verdict always covers the body as deployed rather than the body as authored.
 */
export function assertFilledAnchorsResolve(result: FilledBody, sourceLabel: string): void {
  try {
    assertAnchorsResolve(result.content, sourceLabel);
  } catch (error: unknown) {
    if (result.filled.length === 0 || hasUnresolvableAnchors(result.stripped, sourceLabel)) {
      throw error;
    }
    const bindings = result.filled.map(({ hook, slugs }) => `${hook} <- ${slugs.join(', ')}`).join('; ');
    throw new Error(
      `${sourceLabel} resolves its own anchors and stops resolving once a guidance-hook fill is spliced in, so a ` +
        `binding introduced the failure: ${bindings}. Rename the colliding heading in the bound rulebook, or bind ` +
        `it to a hook this body does not declare.\n${describeError(error)}`,
      { cause: error },
    );
  }
}

/**
 * Resolves every guidance hook `body` declares: a hook `fills` names is replaced by its bound guidance, and one it does
 * not is removed, the same way `stripGuidanceHooks` removes it. Throws whatever `listGuidanceHooks` rejects, and
 * rejects a directive inside the leading frontmatter block that a binding would fill, where a splice would break the
 * YAML rather than add guidance to the body. Such a directive still strips when nothing is bound, so a body that
 * deployed before this had a fill to splice deploys the same way still.
 *
 * A bound body arrives already rendered, so the splice point is free: what varies with position is link and token
 * resolution, and both are settled before the body gets here. Headings are demoted one level as they splice, which
 * keeps a rulebook's h1 title from competing with the host's own structure and moves no anchor, since a fragment
 * derives from heading text alone.
 */
export function fillGuidanceHooks(body: string, fills: GuidanceHookFills, sourceLabel: string): FilledBody {
  // Listing validates: a malformed name, a near-miss directive, or a duplicate declaration fails before anything splices.
  listGuidanceHooks(body, sourceLabel);

  const lines = body.split('\n');
  const frontmatterEnd = findFrontmatterEnd(lines);
  const contentLines: Array<string> = [];
  const strippedLines: Array<string> = [];
  const filled: Array<FilledHook> = [];

  for (const [index, line] of lines.entries()) {
    const name = HOOK_DIRECTIVE_REGEX.exec(line)?.[1];
    if (name === undefined) {
      contentLines.push(line);
      strippedLines.push(line);
      continue;
    }

    const bound = fills.get(name);
    if (bound === undefined || bound.length === 0) {
      continue;
    }

    if (index <= frontmatterEnd) {
      throw new GuidanceHookError(
        `Guidance hook bound inside the frontmatter block: ${sourceLabel}:${index + 1} name="${name}" ` +
          'reason=fill-in-frontmatter. Move the directive below the frontmatter, where its guidance can be read.',
        'fill-in-frontmatter',
      );
    }

    contentLines.push(renderHookFill(name, bound));
    filled.push({ hook: name, slugs: bound.map((fill) => fill.slug) });
  }

  return { content: contentLines.join('\n'), stripped: strippedLines.join('\n'), filled };
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
 *
 * This is the seam that can never fill: a rulebook body, a support entry, or anything `install` renders. Defined as
 * the fill with nothing bound so the two removals cannot drift apart.
 */
export function stripGuidanceHooks(body: string, sourceLabel: string): string {
  return fillGuidanceHooks(body, NO_FILLS, sourceLabel).stripped;
}

// region | Helpers

/** Closing marker of a filled hook's region. */
function closeHookMarker(name: string): string {
  return `<!-- codeassembly-guidance-hook:${name}:end -->`;
}

/**
 * Adds one level to every ATX heading outside a fenced code block, leaving an h6 alone because a seventh `#` is no
 * longer a heading. A `#` inside a fence is content, so the fence is tracked rather than the line matched in isolation.
 */
function demoteHeadings(body: string): string {
  let openFence: string | undefined;
  const demoted = body.split('\n').map((line) => {
    const fence = FENCE_REGEX.exec(line)?.[1];
    if (openFence !== undefined) {
      if (fence !== undefined && fence[0] === openFence[0] && fence.length >= openFence.length) {
        openFence = undefined;
      }
      return line;
    }
    if (fence !== undefined) {
      openFence = fence;
      return line;
    }
    return line.replace(HEADING_REGEX, (match, hashes: string, space: string) =>
      hashes.length < 6 ? `#${hashes}${space}` : match,
    );
  });
  return demoted.join('\n');
}

/** Renders an unknown thrown value as the message it carries, or as itself when it carries none. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Index of the line closing a leading frontmatter block, or `-1` when the body opens with none. */
function findFrontmatterEnd(lines: ReadonlyArray<string>): number {
  return lines[0] === '---' ? lines.indexOf('---', 1) : -1;
}

/** Reports whether `body` carries an anchor-only link target naming no heading, or more than one. */
function hasUnresolvableAnchors(body: string, sourceLabel: string): boolean {
  try {
    assertAnchorsResolve(body, sourceLabel);
    return false;
  } catch {
    return true;
  }
}

/** Opening marker of a filled hook's region. */
function openHookMarker(name: string): string {
  return `<!-- codeassembly-guidance-hook:${name}:start -->`;
}

/**
 * Renders one hook's fill: a hook-level marker pair enclosing one attributed block per bound rulebook. The markers
 * carry the `codeassembly-` prefix that identifies generated content, which also keeps them clear of the directive
 * grammar a source body is parsed against.
 */
function renderHookFill(name: string, bound: ReadonlyArray<GuidanceHookFill>): string {
  const blocks = bound.map((fill) => renderRulebookBlock(fill.slug, demoteHeadings(fill.body)));
  return [openHookMarker(name), ...blocks, closeHookMarker(name)].join('\n');
}

// endregion | Helpers
