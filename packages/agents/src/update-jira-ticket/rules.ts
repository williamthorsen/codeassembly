// One exported function per rule class. Each takes the tokenized payload (and the original source for line
// derivation) and returns zero or more findings. The rule IDs are stable across versions — the skill body and
// tests both reference them by string.

import { lineOf, type Token, walkTokens } from './parser.ts';
import type { Finding } from './types.ts';

/** Allowlisted element names. Mirrors the SKILL.md allowlist exactly; this is the canonical source of truth. */
export const ALLOWED_ELEMENTS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'code',
  'a',
  'blockquote',
  'hr',
  'br',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
]);

/** Inline-mark elements that may not nest with `<code>` in either direction. */
const INLINE_MARK_ELEMENTS = new Set(['strong', 'em', 'a', 'strike', 'u', 'sub', 'sup']);

/** Universally-safe HTML entities. Anything else in text content is flagged by {@link namedEntityRule}. */
const SAFE_TEXT_ENTITIES = new Set(['amp', 'lt', 'gt']);

/**
 * Flag any `<code>` whose direct or transitive open ancestor is an inline-mark element, and vice versa.
 * Both nesting directions are caught because each tag is visited as it opens and its parent stack is
 * inspected.
 */
export function compositionCodeInlineMarkRule(tokens: readonly Token[], source: string): Finding[] {
  const findings: Finding[] = [];
  walkTokens(tokens, (token, parents) => {
    if (token.name === 'code') {
      const offender = parents.find((parent) => INLINE_MARK_ELEMENTS.has(parent.name));
      if (offender) {
        findings.push({
          rule: 'composition-code-inline-mark',
          snippet: `${offender.raw}...${token.raw}`,
          line: lineOf(source, offender.offset),
          fix: `Move the <code> outside <${offender.name}>, or drop the inline mark.`,
        });
      }
    } else if (INLINE_MARK_ELEMENTS.has(token.name)) {
      const offender = parents.find((parent) => parent.name === 'code');
      if (offender) {
        findings.push({
          rule: 'composition-code-inline-mark',
          snippet: `${offender.raw}...${token.raw}`,
          line: lineOf(source, offender.offset),
          fix: `Move <${token.name}> outside the <code>, or drop the inline mark.`,
        });
      }
    }
  });
  return findings;
}

/**
 * Flag named HTML entities other than `&amp;`, `&lt;`, `&gt;` that appear in text content.
 * Attribute values are not scanned, because that's where `&quot;` and `&apos;` legitimately live —
 * the tokenizer separates text from attribute values so this rule never sees them.
 */
export function namedEntityRule(tokens: readonly Token[], source: string): Finding[] {
  const findings: Finding[] = [];
  const pattern = /&([a-zA-Z][a-zA-Z0-9]*);/g;
  for (const token of tokens) {
    if (token.type !== 'text') continue;
    for (const match of token.value.matchAll(pattern)) {
      const entityName = match[1];
      if (entityName === undefined || SAFE_TEXT_ENTITIES.has(entityName)) continue;
      const offset = token.offset + match.index;
      findings.push({
        rule: 'named-entity',
        snippet: match[0],
        line: lineOf(source, offset),
        fix: `Replace with literal Unicode (e.g., — for &mdash;, … for &hellip;, a regular space for &nbsp;).`,
      });
    }
  }
  return findings;
}

/** Flag any `<ac:*>` or `<ri:*>` element (Confluence storage-format constructs). */
export function confluenceConstructRule(tokens: readonly Token[], source: string): Finding[] {
  const findings: Finding[] = [];
  for (const token of tokens) {
    if (token.type !== 'open-tag') continue;
    if (token.name.startsWith('ac:') || token.name.startsWith('ri:')) {
      findings.push({
        rule: 'confluence-construct',
        snippet: token.raw,
        line: lineOf(source, token.offset),
        fix: `Remove the <${token.rawName}> construct. Confluence storage-format elements have no Jira analogue.`,
      });
    }
  }
  return findings;
}

/**
 * Flag any `<pre>` element whose contents (until its matching close tag) contain a newline. Inline `<code>`
 * with the same text is not flagged, because the trigger is the `<pre>` wrapper, not the newline alone.
 */
export function preMultilineRule(tokens: readonly Token[], source: string): Finding[] {
  const findings: Finding[] = [];
  for (const [i, token] of tokens.entries()) {
    if (token.type !== 'open-tag' || token.name !== 'pre') continue;
    if (hasNewlineInPre(tokens, i)) {
      findings.push({
        rule: 'pre-multiline',
        snippet: token.raw,
        line: lineOf(source, token.offset),
        fix: 'Replace the multi-line <pre> with per-line <p><code>...</code></p>, or a single <p> using <br> separators.',
      });
    }
  }
  return findings;
}

/** Scan from the `<pre>` open tag at `tokens[startIndex]` until its matching close, returning true on a newline. */
function hasNewlineInPre(tokens: readonly Token[], startIndex: number): boolean {
  let depth = 1;
  for (let j = startIndex + 1; j < tokens.length; j += 1) {
    const inner = tokens[j];
    if (inner === undefined) break;
    if (inner.type === 'open-tag' && inner.name === 'pre' && !inner.selfClosing) {
      depth += 1;
    } else if (inner.type === 'close-tag' && inner.name === 'pre') {
      depth -= 1;
      if (depth === 0) return false;
    } else if (inner.type === 'text' && inner.value.includes('\n')) {
      return true;
    }
  }
  return false;
}

/** Flag any open tag whose name is not in {@link ALLOWED_ELEMENTS} and not a `<ac:*>`/`<ri:*>` construct. */
export function disallowedElementRule(tokens: readonly Token[], source: string): Finding[] {
  const findings: Finding[] = [];
  for (const token of tokens) {
    if (token.type !== 'open-tag') continue;
    if (ALLOWED_ELEMENTS.has(token.name)) continue;
    // Confluence constructs are handled by their own rule; don't double-report under disallowed-element.
    if (token.name.startsWith('ac:') || token.name.startsWith('ri:')) continue;
    findings.push({
      rule: 'disallowed-element',
      snippet: token.raw,
      line: lineOf(source, token.offset),
      fix: `Remove or replace <${token.rawName}>. The allowlist is documented in update-jira-ticket/SKILL.md.`,
    });
  }
  return findings;
}

/** All rule functions in deterministic order. The order shapes the output ordering when multiple rules fire. */
export const ALL_RULES: ReadonlyArray<(tokens: readonly Token[], source: string) => Finding[]> = [
  compositionCodeInlineMarkRule,
  namedEntityRule,
  confluenceConstructRule,
  preMultilineRule,
  disallowedElementRule,
];
