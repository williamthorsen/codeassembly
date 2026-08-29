import { HARNESSES } from './harness.ts';
import type { HarnessId } from './types.ts';

/**
 * Thrown when `rewriteToolNames` encounters a `{tool:NAME}` placeholder naming no canonical tool. Caught by the install
 * pipeline and surfaced as a fatal install error.
 *
 * The message names no harness, because every harness maps the same closed set of canonical names: a name unmapped for
 * one is unmapped for all. Keeping it out is also what lets `validate` fold the defect to a single line rather than
 * repeating it per harness. The harness stays on the instance for a caller that needs to know which render raised it.
 */
export class ToolNameRewriteError extends Error {
  override readonly name = 'ToolNameRewriteError';
  readonly toolName: string;
  readonly harnessId: HarnessId;
  readonly contextLabel: string;
  readonly line: number;

  constructor(toolName: string, harnessId: HarnessId, contextLabel: string, line: number) {
    super(
      `Unmapped tool name "${toolName}" in ${contextLabel}:${line}. ` +
        `The canonical tool names are fixed by this release, in the tool's own harness table.`,
    );
    this.toolName = toolName;
    this.harnessId = harnessId;
    this.contextLabel = contextLabel;
    this.line = line;
  }
}

/** Matches `{tool:NAME}` placeholders. NAME starts with a letter, then letters/digits/underscores. */
const PLACEHOLDER_RE = /\{tool:([A-Za-z][A-Za-z0-9_]*)}/g;

/**
 * Replaces every `{tool:NAME}` placeholder in `content` with what `harnessId` calls `NAME`. A name the harness maps
 * nothing to throws `ToolNameRewriteError` with the canonical name, `contextLabel`, and the 1-based line number of the
 * offending match. There is no identity pass-through; every match must resolve through the harness table or the call
 * fails.
 */
export function rewriteToolNames(content: string, harnessId: HarnessId, contextLabel: string): string {
  const toolNames: Readonly<Record<string, string>> = HARNESSES[harnessId].toolNames;
  return content.replace(PLACEHOLDER_RE, (_match: string, toolName: string, offset: number): string => {
    // Guarded by `hasOwn`: a placeholder naming an `Object.prototype` member (`{tool:constructor}`) would otherwise
    // resolve to the inherited value instead of failing.
    const replacement = Object.hasOwn(toolNames, toolName) ? toolNames[toolName] : undefined;
    if (replacement === undefined) {
      throw new ToolNameRewriteError(toolName, harnessId, contextLabel, computeLine(content, offset));
    }
    return replacement;
  });
}

// region | Helpers

function computeLine(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (content.codePointAt(i) === 10) {
      line++;
    }
  }
  return line;
}

// endregion | Helpers
