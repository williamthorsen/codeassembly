// Minimal HTML tokenizer for the pre-flight checker.
//
// Not a conformant HTML5 parser. Just enough to:
//   - recognize tag boundaries, including self-closing and namespaced tags like `ac:task-list`,
//   - separate text content from attribute values (so named-entity scans skip `&quot;` inside `href="..."`),
//   - track source offsets so rules can derive 1-based line numbers.
//
// Malformed input (unbalanced quotes, runaway `<`) is tolerated — the tokenizer prefers progress over
// strictness, since the goal is finding known-bad patterns, not validating that the HTML is well-formed.

/** A single open-tag token. Self-closing variants like `<br>` or `<hr/>` set `selfClosing: true`. */
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

/** A parsed attribute. `value` is `null` for valueless attributes (rare in well-formed HTML). */
export interface Attribute {
  name: string;
  value: string | null;
}

/** Self-closing element names per HTML — used to treat `<br>` and `<hr>` as self-closing without `/`. */
const VOID_ELEMENTS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source']);

/** Tokenize `html` into a flat stream. Always returns; never throws on malformed input. */
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

/** A tag-start char is `/` (close tag) or an ASCII letter (open tag). */
function isTagStartChar(char: string): boolean {
  return char === '/' || (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
}

/** Parse a single tag starting at `html[start]` (which is `<`). Returns the token and the index just past `>`. */
function parseTag(html: string, start: number): { token: Token; nextIndex: number } {
  const isClose = html[start + 1] === '/';
  const nameStart = isClose ? start + 2 : start + 1;
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

/** Parse the attribute section of an open tag. Returns parsed attrs, the self-closing flag, and the offset of `>`. */
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
      // Defensive: unrecognized char inside a tag — skip one to make progress.
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

/** Read an optional `=value` clause; returns the value (or `null` for valueless attrs) and the next index. */
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

/** Advance `index` while the predicate holds for the current char. Returns the index of the first char that fails. */
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

/** Advance until the target char is found. Returns its index, or `html.length` if not found. */
function readUntilChar(html: string, startIndex: number, target: string): number {
  const length = html.length;
  let index = startIndex;
  while (index < length && html[index] !== target) index += 1;
  return index;
}

/** Skip whitespace starting at `startIndex`; returns the index of the first non-whitespace char. */
function skipWhitespace(html: string, startIndex: number): number {
  return readWhile(html, startIndex, isWhitespace);
}

/** Tag-name chars: ASCII letters, digits, `:` (namespaces), `-` (custom elements). */
function isNameChar(char: string): boolean {
  return (
    (char >= 'a' && char <= 'z') ||
    (char >= 'A' && char <= 'Z') ||
    (char >= '0' && char <= '9') ||
    char === ':' ||
    char === '-'
  );
}

/** Attribute names are more permissive than tag names — letters, digits, `-`, `_`, `:`. */
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

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f';
}

/** Derive a 1-based line number from a byte offset into the original source. */
export function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

/** Visitor signature for {@link walkTokens}. Receives the current open-tag token and its parent stack. */
export type Visitor = (token: OpenTagToken, parents: readonly OpenTagToken[]) => void;

/** Walk `tokens` and call `visit` for each open tag, exposing the chain of currently-open ancestors. */
export function walkTokens(tokens: readonly Token[], visit: Visitor): void {
  const stack: OpenTagToken[] = [];
  for (const token of tokens) {
    if (token.type === 'open-tag') {
      visit(token, stack);
      if (!token.selfClosing) stack.push(token);
    } else if (token.type === 'close-tag') {
      // Pop the matching open tag if present; tolerate mismatches by popping the innermost match.
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i]?.name === token.name) {
          stack.length = i;
          break;
        }
      }
    }
  }
}
