import { isRecord } from '../lib/type-guards.ts';

/** The fields of `gh pr view --json body,closingIssuesReferences` that the selection reads. */
export interface PrTicketInput {
  body: string;
  closingIssueNumbers: number[];
}

/** The selected issue number and the rule that selected it; `number` is null only when `source` is `none`. */
export interface PrTicketSelection {
  number: number | null;
  source: 'body-bare' | 'body-keyword' | 'closing-reference' | 'none';
}

// A closing keyword followed by `#n`, or a bare `#n` that is not part of a word, a path, a cross-repo reference, or an
// HTML entity. The keyword alternative comes first, so a keyword reference matches as one even though it contains a
// bare `#n`.
const ISSUE_REFERENCE = /\b(?:closes|fixes|resolves):?\s+#(\d+)\b|(?<![\w/#&])#(\d+)\b/giu;

/**
 * Validates the parsed JSON emitted by `gh pr view --json body,closingIssuesReferences`. Throws when a field has the
 * wrong shape.
 */
export function parsePrTicketInput(value: unknown): PrTicketInput {
  if (!isRecord(value)) {
    throw new Error('input must be a JSON object');
  }

  const { body, closingIssuesReferences } = value;
  if (body !== undefined && body !== null && typeof body !== 'string') {
    throw new Error('body must be a string');
  }
  if (closingIssuesReferences !== undefined && !Array.isArray(closingIssuesReferences)) {
    throw new Error('closingIssuesReferences must be an array');
  }

  const closingIssueNumbers = (closingIssuesReferences ?? []).map((reference: unknown) => {
    if (!isRecord(reference) || typeof reference.number !== 'number' || !Number.isSafeInteger(reference.number)) {
      throw new Error('each closingIssuesReferences entry must have an integer number');
    }
    return reference.number;
  });

  return { body: body ?? '', closingIssueNumbers };
}

/**
 * Selects the PR's ticket: the first closing reference when there is one, otherwise the earliest issue reference in
 * the body outside code.
 */
export function selectPrTicket(input: PrTicketInput): PrTicketSelection {
  const [closingNumber] = input.closingIssueNumbers;
  if (closingNumber !== undefined) {
    return { number: closingNumber, source: 'closing-reference' };
  }

  const match = ISSUE_REFERENCE.exec(maskCode(input.body));
  ISSUE_REFERENCE.lastIndex = 0;
  if (match === null) {
    return { number: null, source: 'none' };
  }
  const [, keywordNumber, bareNumber = ''] = match;
  if (keywordNumber !== undefined) {
    return { number: Number(keywordNumber), source: 'body-keyword' };
  }
  return { number: Number(bareNumber), source: 'body-bare' };
}

// region | Helpers

/** Returns the text with every character except a line break replaced by a space. */
function blank(text: string): string {
  return text.replaceAll(/[^\n]/gu, ' ');
}

/** Replaces every character of a fenced code block or an inline code span with a space, keeping line breaks. */
function maskCode(markdown: string): string {
  return maskInlineCode(maskFencedBlocks(markdown));
}

/** Blanks fenced code blocks, fence lines included; a fence that is never closed runs to the end of the text. */
function maskFencedBlocks(markdown: string): string {
  let fence: { char: string; length: number } | undefined;
  return markdown
    .split('\n')
    .map((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
      if (fence === undefined) {
        if (marker === undefined) {
          return line;
        }
        fence = { char: marker.charAt(0), length: marker.length };
      } else if (
        marker !== undefined &&
        marker.charAt(0) === fence.char &&
        marker.length >= fence.length &&
        line.trim() === marker
      ) {
        fence = undefined;
      }
      return blank(line);
    })
    .join('\n');
}

/** Blanks inline code spans, each opened and closed by backtick runs of equal length. */
function maskInlineCode(markdown: string): string {
  return markdown.replaceAll(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/gu, (span) => blank(span));
}

// endregion | Helpers
