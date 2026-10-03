// Minimal HTML tokenizer for the pre-flight checker.
//
// Not a conformant HTML5 parser. The checker finds known-bad patterns rather than validating that the HTML is
// well-formed, so the tokenizer favors progress over strictness on malformed input.
//
// Known limitations (intentional; documented here so that future contributors don't quietly "fix" them):
//   - HTML comments (`<!-- ... -->`), CDATA sections (`<![CDATA[ ... ]]>`), and `<!DOCTYPE ...>` declarations are
//     not recognized; because `isTagStartChar` rejects their `<!` prefix, the surrounding text is scanned as
//     usual and any tag-shaped content inside them WILL be tokenized as real tags. Jira-bound HTML in this
//     codebase does not contain these constructs. The false-positive surface is theoretical.
//   - `walkTokens` only pops the ancestor stack on a matching close tag. When a sibling `<strong>` follows an
//     unclosed `<code>`, `walkTokens` treats the `<strong>` as nested under the `<code>`, and the composition rule
//     reports a finding. This is fail-loud by design: An imbalanced payload almost certainly indicates a
//     generation bug, and reporting it as a finding is preferable to silently auto-balancing.

/** A single open-tag token. */
export interface OpenTagToken {
  type: 'open-tag';
  name: string;
  /** Original tag name as written (preserves case for snippet display). */
  rawName: string;
  attrs: Attribute[];
  selfClosing: boolean;
  offset: number;
  /** Verbatim source slice covering `<...>` including delimiters. */
  raw: string;
}

/** A single close-tag token: `</tag>`. */
export interface CloseTagToken {
  type: 'close-tag';
  name: string;
  rawName: string;
  offset: number;
  raw: string;
}

/** Text content between tags. May contain entity references; the tokenizer does not decode them. */
export interface TextToken {
  type: 'text';
  value: string;
  offset: number;
}

export type Token = OpenTagToken | CloseTagToken | TextToken;

/** A parsed attribute. `value` is `null` for a valueless attribute. */
export interface Attribute {
  name: string;
  value: string | null;
}

/** Self-closing element names per HTML, used to treat `<br>` and `<hr>` as self-closing without `/`. */
const VOID_ELEMENTS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source']);

/** Tokenizes `html` into a flat stream. Always returns; never throws on malformed input. */
export function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const length = html.length;
  let index = 0;
  let textStart = 0;

  while (index < length) {
    const char = html[index];
    const nextChar = html[index + 1] ?? '';
    if (char === '<' && isTagStartChar(nextChar)) {
      if (index > textStart) {
        tokens.push({ type: 'text', value: html.slice(textStart, index), offset: textStart });
      }
      const parsed = parseTag(html, index);
      tokens.push(parsed.token);
      index = parsed.nextIndex;
      textStart = index;
    } else {
      index += 1;
    }
  }

  if (textStart < length) {
    tokens.push({ type: 'text', value: html.slice(textStart, length), offset: textStart });
  }

  return tokens;
}

/** Returns true when `char` may follow `<`: `/` for a close tag, an ASCII letter for an open tag. */
function isTagStartChar(char: string): boolean {
  return char === '/' || (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
}

/** Parses a single tag starting at `html[start]` (which is `<`). Returns the token and the index just past `>`. */
function parseTag(html: string, start: number): { token: Token; nextIndex: number } {
  const isClose = html[start + 1] === '/';
  const nameStart = start + (isClose ? 2 : 1);
  const nameEnd = readWhile(html, nameStart, isNameChar);
  const rawName = html.slice(nameStart, nameEnd);
  const name = rawName.toLowerCase();

  if (isClose) {
    const closeEnd = readUntilChar(html, nameEnd, '>');
    const end = Math.min(closeEnd + 1, html.length);
    return {
      token: { type: 'close-tag', name, rawName, offset: start, raw: html.slice(start, end) },
      nextIndex: end,
    };
  }

  const { attrs, selfClosing, end: bodyEnd } = parseAttributes(html, nameEnd);
  const end = bodyEnd < html.length ? bodyEnd + 1 : html.length;
  const effectivelySelfClosing = selfClosing || VOID_ELEMENTS.has(name);
  return {
    token: {
      type: 'open-tag',
      name,
      rawName,
      attrs,
      selfClosing: effectivelySelfClosing,
      offset: start,
      raw: html.slice(start, end),
    },
    nextIndex: end,
  };
}

/** Parses the attribute section of an open tag. `end` is the offset of `>`. */
function parseAttributes(html: string, startIndex: number): { attrs: Attribute[]; selfClosing: boolean; end: number } {
  const length = html.length;
  const attrs: Attribute[] = [];
  let selfClosing = false;
  let index = startIndex;

  while (index < length) {
    index = skipWhitespace(html, index);
    const char = html[index];
    if (char === undefined || char === '>') break;
    if (char === '/') {
      selfClosing = true;
      index += 1;
      continue;
    }

    const attrNameStart = index;
    index = readWhile(html, index, isAttrNameChar);
    if (index === attrNameStart) {
      // Defensive: Skip one unrecognized char inside a tag to make progress.
      index += 1;
      continue;
    }
    const attrName = html.slice(attrNameStart, index).toLowerCase();
    const { value, next } = parseAttributeValue(html, index);
    attrs.push({ name: attrName, value });
    index = next;
  }

  return { attrs, selfClosing, end: index };
}

/** Reads an optional `=value` clause, quoted or bare. */
function parseAttributeValue(html: string, startIndex: number): { value: string | null; next: number } {
  let index = skipWhitespace(html, startIndex);
  if (html[index] !== '=') return { value: null, next: index };

  index = skipWhitespace(html, index + 1);
  const quote = html[index];
  if (quote === '"' || quote === "'") {
    const valueStart = index + 1;
    const valueEnd = readUntilChar(html, valueStart, quote);
    const next = valueEnd < html.length ? valueEnd + 1 : html.length;
    return { value: html.slice(valueStart, valueEnd), next };
  }

  const valueStart = index;
  const valueEnd = readWhile(html, valueStart, (char) => !isWhitespace(char) && char !== '>' && char !== '/');
  return { value: html.slice(valueStart, valueEnd), next: valueEnd };
}

/** Advances `index` while the predicate holds for the current char. Returns the index of the first char that fails. */
function readWhile(html: string, startIndex: number, predicate: (char: string) => boolean): number {
  const length = html.length;
  let index = startIndex;
  while (index < length) {
    const char = html[index];
    if (char === undefined || !predicate(char)) break;
    index += 1;
  }
  return index;
}

/** Advances until the target char is found. Returns its index, or `html.length` if not found. */
function readUntilChar(html: string, startIndex: number, target: string): number {
  const length = html.length;
  let index = startIndex;
  while (index < length && html[index] !== target) index += 1;
  return index;
}

/** Skips whitespace starting at `startIndex`; returns the index of the first non-whitespace char. */
function skipWhitespace(html: string, startIndex: number): number {
  return readWhile(html, startIndex, isWhitespace);
}

/** Returns true for a tag-name char: an ASCII letter, a digit, `:` (namespaces), or `-` (custom elements). */
function isNameChar(char: string): boolean {
  return (
    (char >= 'a' && char <= 'z') ||
    (char >= 'A' && char <= 'Z') ||
    (char >= '0' && char <= '9') ||
    char === ':' ||
    char === '-'
  );
}

/** Returns true for an attribute-name char: a tag-name char or `_`. */
function isAttrNameChar(char: string): boolean {
  return (
    (char >= 'a' && char <= 'z') ||
    (char >= 'A' && char <= 'Z') ||
    (char >= '0' && char <= '9') ||
    char === '-' ||
    char === '_' ||
    char === ':'
  );
}

/** Reports whether `char` is an HTML whitespace character. */
function isWhitespace(char: string): boolean {
  return [' ', '\t', '\n', '\r', '\f'].includes(char);
}

/** Derives a 1-based line number from an offset into the original source. */
export function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

/** Visitor signature for {@link walkTokens}. */
export type Visitor = (token: OpenTagToken, parents: readonly OpenTagToken[]) => void;

/** Walks `tokens` and calls `visit` for each open tag, exposing the chain of currently-open ancestors. */
export function walkTokens(tokens: readonly Token[], visit: Visitor): void {
  const stack: OpenTagToken[] = [];
  for (const token of tokens) {
    if (token.type === 'open-tag') {
      visit(token, stack);
      if (!token.selfClosing) stack.push(token);
    } else if (token.type === 'close-tag') {
      // Pop to the innermost open tag of the same name, so that a mismatched close tag cannot desync the stack.
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i]?.name === token.name) {
          stack.length = i;
          break;
        }
      }
    }
  }
}
