import { describe, expect, it } from 'vitest';

import { check } from '../check.ts';
import type { Finding, RuleId } from '../types.ts';

/** Convenience: assert that `check(html)` returns `ok: false` and includes a finding whose `rule` is `ruleId`. */
function expectFinding(html: string, ruleId: RuleId): Finding {
  const result = check(html);
  if (result.ok) {
    throw new Error(`Expected ok: false with rule ${ruleId}, got ok: true for: ${html}`);
  }
  const finding = result.findings.find((entry) => entry.rule === ruleId);
  if (!finding) {
    const seen = result.findings.map((entry) => entry.rule).join(', ');
    throw new Error(`Expected finding with rule ${ruleId}; got: [${seen}]`);
  }
  return finding;
}

/** Convenience: assert that `check(html)` returns `ok: true`. Fails with the seen findings on mismatch. */
function expectClean(html: string): void {
  const result = check(html);
  if (!result.ok) {
    const seen = result.findings.map((entry) => `${entry.rule}: ${entry.snippet}`).join('; ');
    throw new Error(`Expected ok: true; got findings: [${seen}]`);
  }
}

describe(check, () => {
  describe('clean payloads', () => {
    it('accepts a simple paragraph', () => {
      expectClean('<p>Hello, world.</p>');
    });

    it('accepts every allowlisted element in combination', () => {
      const html = `
        <h1>Title</h1>
        <h2>Subtitle</h2>
        <p>Paragraph with <strong>bold</strong>, <em>italic</em>, and <a href="https://example.com">a link</a>.</p>
        <ul><li>One</li><li>Two</li></ul>
        <ol><li>First</li><li>Second</li></ol>
        <blockquote><p>Quoted.</p></blockquote>
        <hr>
        <p>Inline <code>literal</code> works.</p>
        <table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>
        <p>Line one.<br>Line two.</p>
      `;
      expectClean(html);
    });

    it('accepts the three universally-safe named entities', () => {
      expectClean('<p>A &amp; B, X &lt; Y, P &gt; Q.</p>');
    });

    it('accepts literal Unicode characters in text', () => {
      expectClean('<p>An em-dash — here, an ellipsis … there, a nbsp gap.</p>');
    });
  });

  describe('composition-code-inline-mark', () => {
    it('flags <strong><code>', () => {
      const finding = expectFinding('<p><strong><code>x</code></strong></p>', 'composition-code-inline-mark');
      expect(finding.snippet).toContain('<code>');
    });

    it('flags the reverse nesting <code><strong>', () => {
      expectFinding('<p><code><strong>x</strong></code></p>', 'composition-code-inline-mark');
    });

    it('flags <em><code>', () => {
      expectFinding('<p><em><code>x</code></em></p>', 'composition-code-inline-mark');
    });

    it('flags <code><em>', () => {
      expectFinding('<p><code><em>x</em></code></p>', 'composition-code-inline-mark');
    });

    it('flags <a><code>', () => {
      expectFinding('<p><a href="https://x.test"><code>x</code></a></p>', 'composition-code-inline-mark');
    });

    it('flags <code><a>', () => {
      expectFinding('<p><code><a href="https://x.test">x</a></code></p>', 'composition-code-inline-mark');
    });

    it('does not flag sibling <code> and <strong>', () => {
      expectClean('<p><strong>Bold</strong> then <code>code</code>.</p>');
    });

    it('does not flag <code> alone or <strong> alone', () => {
      expectClean('<p><code>x</code> and <strong>y</strong></p>');
    });
  });

  describe('named-entity', () => {
    it('flags &mdash;', () => {
      const finding = expectFinding('<p>A&mdash;B</p>', 'named-entity');
      expect(finding.snippet).toBe('&mdash;');
    });

    it('flags &nbsp;', () => {
      expectFinding('<p>A&nbsp;B</p>', 'named-entity');
    });

    it('flags &hellip;', () => {
      expectFinding('<p>Wait&hellip;</p>', 'named-entity');
    });

    it('emits one finding per occurrence', () => {
      const result = check('<p>&mdash; &mdash; &nbsp;</p>');
      if (result.ok) throw new Error('expected findings');
      const entityFindings = result.findings.filter((entry) => entry.rule === 'named-entity');
      expect(entityFindings).toHaveLength(3);
    });

    it('does not flag &amp;, &lt;, &gt; in text', () => {
      expectClean('<p>&amp; and &lt; and &gt;</p>');
    });

    it('does not flag &quot; or &apos; inside an attribute value', () => {
      expectClean('<p><a href="https://x.test/?q=&quot;hi&quot;">link</a></p>');
    });
  });

  describe('confluence-construct', () => {
    it('flags <ac:task-list>', () => {
      const finding = expectFinding('<p>x</p><ac:task-list/>', 'confluence-construct');
      expect(finding.snippet).toContain('ac:task-list');
    });

    it('flags <ri:user>', () => {
      expectFinding('<p>hi <ri:user/></p>', 'confluence-construct');
    });

    it('flags <ac:structured-macro> with attributes', () => {
      expectFinding('<p>x</p><ac:structured-macro ac:name="info">y</ac:structured-macro>', 'confluence-construct');
    });

    it('does not flag tags that merely start with the letters a/r', () => {
      expectClean('<p><a href="https://x.test">link</a></p>');
    });
  });

  describe('pre-multiline', () => {
    it('flags <pre> containing a newline', () => {
      expectFinding('<pre>line one\nline two</pre>', 'pre-multiline');
    });

    it('flags <pre><code> containing a newline (the pre is still the trigger)', () => {
      expectFinding('<pre><code>line one\nline two</code></pre>', 'pre-multiline');
    });

    it('does not flag inline <code> containing a newline (no <pre> wrapper)', () => {
      const result = check('<p><code>line one\nline two</code></p>');
      if (result.ok) return;
      expect(result.findings.find((entry) => entry.rule === 'pre-multiline')).toBeUndefined();
    });
  });

  describe('disallowed-element', () => {
    it('flags <div>', () => {
      const finding = expectFinding('<div>x</div>', 'disallowed-element');
      expect(finding.snippet).toContain('div');
    });

    it('flags <span>', () => {
      expectFinding('<p><span>x</span></p>', 'disallowed-element');
    });

    it('flags <pre> as disallowed in addition to flagging the multi-line trigger when both apply', () => {
      const result = check('<pre>line one\nline two</pre>');
      if (result.ok) throw new Error('expected findings');
      const rules = result.findings.map((entry) => entry.rule);
      expect(rules).toContain('disallowed-element');
      expect(rules).toContain('pre-multiline');
    });

    it('does not flag tag-like substrings inside attribute values', () => {
      expectClean('<p><a href="https://x.test" title="X &lt; Y">link</a></p>');
    });

    it('does not flag any allowlisted tag', () => {
      expectClean('<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>');
    });
  });
});
