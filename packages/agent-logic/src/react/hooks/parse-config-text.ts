import { describeError } from '@williamthorsen/toolbelt.errors';

import type { Problem } from '../../schema/validate-config.ts';

export type ParseResult = { ok: true; value: unknown } | { ok: false; isNotJson: boolean; problems: Problem[] };

/** Where the text came from, which decides how a problem names it and what it asks the user to do again. */
export type TextOrigin = 'conversion' | 'file' | 'paste';

/**
 * Parses an agent-logic file's text as JSON, removing a Markdown code fence that encloses all of it. Text that begins
 * like JSON and does not parse is reported as a syntax error; any other unparseable text, as text that is not JSON.
 */
export function parseConfigText(text: string, origin: TextOrigin): ParseResult {
  const json = removeEnclosingFence(text);
  try {
    const value: unknown = JSON.parse(json);
    return { ok: true, value };
  } catch (error) {
    const { subject, retry } = DESCRIPTIONS[origin];
    if (!/^\s*[[{]/.test(json)) {
      return {
        ok: false,
        isNotJson: true,
        problems: [
          {
            path: '',
            message: `${subject} is not JSON, so it is not an agent-logic file. To chart a prompt, convert it first.`,
          },
        ],
      };
    }
    const detail = describeError(error);
    return {
      ok: false,
      isNotJson: false,
      problems: [{ path: '', message: `${subject} is not valid JSON (${detail}). Fix the syntax and ${retry}.` }],
    };
  }
}

// region | Helpers
const DESCRIPTIONS: Record<TextOrigin, { subject: string; retry: string }> = {
  conversion: { subject: 'The converted file', retry: 'convert the prompt again' },
  file: { subject: 'The file', retry: 'open it again' },
  paste: { subject: 'The pasted text', retry: 'load it again' },
};

// Match a fence of exactly three backticks with an optional language tag, enclosing the whole text.
const ENCLOSING_FENCE = /^```(?!`)[^\n`]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/;

/** Returns the contents of a Markdown code fence that encloses the whole trimmed text, or the text itself. */
function removeEnclosingFence(text: string): string {
  return ENCLOSING_FENCE.exec(text.trim())?.[1] ?? text;
}
// endregion | Helpers
