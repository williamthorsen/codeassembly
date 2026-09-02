import { describe, expect, it } from 'vitest';

import {
  assertFilledAnchorsResolve,
  fillGuidanceHooks,
  GuidanceHookError,
  type GuidanceHookFill,
  type GuidanceHookFills,
  isGuidanceHookName,
  listGuidanceHooks,
  stripGuidanceHooks,
} from '../guidance-hooks.ts';

const SOURCE_LABEL = 'skills/demo/SKILL.md';

describe(listGuidanceHooks, () => {
  it('collects every declared hook in source order with its 1-based line', () => {
    const body = '# Demo\n\n<!-- guidance-hook: implementation-preferences -->\n\nProse.\n<!-- guidance-hook: a11y -->';

    expect(listGuidanceHooks(body, SOURCE_LABEL)).toEqual([
      { name: 'implementation-preferences', lineNumber: 3 },
      { name: 'a11y', lineNumber: 6 },
    ]);
  });

  it('recognizes a directive carrying leading and trailing whitespace', () => {
    const body = '  <!--  guidance-hook:   project-glossary  -->  \t';

    expect(listGuidanceHooks(body, SOURCE_LABEL)).toEqual([{ name: 'project-glossary', lineNumber: 1 }]);
  });

  it('ignores a directive that does not occupy a full line', () => {
    const body = 'Declare it with `<!-- guidance-hook: preferences -->` inline.\nTrailing <!-- guidance-hook: x -->.';

    expect(listGuidanceHooks(body, SOURCE_LABEL)).toEqual([]);
  });

  it('ignores the include and reserved slot grammars', () => {
    const body = '<!-- include: _partials/frag.md / -->\n<!-- children -->\n<!-- slot: preferences -->\n<!-- /slot -->';

    expect(listGuidanceHooks(body, SOURCE_LABEL)).toEqual([]);
  });

  it('rejects a full-line comment that misses the directive shape while reaching for it', () => {
    for (const line of [
      '<!-- guidance-hooks: implementation-preferences -->',
      '<!-- guidance-hook -->',
      '<!-- guidance hook: preferences -->',
      '<!-- Guidance-Hook: preferences -->',
      '<!-- guidancehook: preferences -->',
    ]) {
      expect(() => listGuidanceHooks(line, SOURCE_LABEL), line).toThrow(
        expect.objectContaining({ reason: 'unrecognized-directive' }),
      );
    }
  });

  it('leaves prose and the neighbouring comment grammars unrejected', () => {
    for (const line of [
      '<!-- guidance hooks are described below -->',
      'Write `<!-- guidance-hooks: x -->` to see nothing happen.',
      '<!-- include: _partials/frag.md / -->',
      '<!-- children -->',
      '<!-- slot: preferences -->',
      '<!-- codeassembly-skill:commit -->',
    ]) {
      expect(listGuidanceHooks(line, SOURCE_LABEL), line).toEqual([]);
    }
  });

  it('anchors an unrecognized-directive rejection to the source and line', () => {
    const body = '# Demo\n\n<!-- guidance-hooks: preferences -->';

    expect(() => listGuidanceHooks(body, SOURCE_LABEL)).toThrow(
      /skills\/demo\/SKILL\.md:3 line="<!-- guidance-hooks: preferences -->" reason=unrecognized-directive/,
    );
  });

  it('rejects a hook name outside the kebab-case, letter-led slug grammar', () => {
    for (const name of ['', '-leading', '2fa', 'Mixed-Case', 'under_score', 'two words']) {
      expect(() => listGuidanceHooks(`<!-- guidance-hook: ${name} -->`, SOURCE_LABEL), name).toThrow(GuidanceHookError);
    }
  });

  it('anchors a malformed-name rejection to the source and line', () => {
    const body = '# Demo\n<!-- guidance-hook: Mixed-Case -->';

    expect(() => listGuidanceHooks(body, SOURCE_LABEL)).toThrow(
      /skills\/demo\/SKILL\.md:2 name="Mixed-Case" reason=malformed-name/,
    );
  });

  it('rejects a hook declared twice, naming both lines', () => {
    const body = '<!-- guidance-hook: preferences -->\n\nProse.\n\n<!-- guidance-hook: preferences -->';

    expect(() => listGuidanceHooks(body, SOURCE_LABEL)).toThrow(
      /skills\/demo\/SKILL\.md:5 name="preferences" firstDeclaredAt=1 reason=duplicate-hook/,
    );
    expect(() => listGuidanceHooks(body, SOURCE_LABEL)).toThrow(expect.objectContaining({ reason: 'duplicate-hook' }));
  });

  it('accepts two distinct hooks in one body', () => {
    const body = '<!-- guidance-hook: preferences -->\n<!-- guidance-hook: glossary -->';

    expect(listGuidanceHooks(body, SOURCE_LABEL).map((hook) => hook.name)).toEqual(['preferences', 'glossary']);
  });
});

describe(stripGuidanceHooks, () => {
  it('removes the directive line, joining the surrounding lines verbatim', () => {
    const body = '# Demo\n\n<!-- guidance-hook: preferences -->\n\nProse.\n';

    expect(stripGuidanceHooks(body, SOURCE_LABEL)).toBe('# Demo\n\n\nProse.\n');
  });

  it('leaves a body declaring no hook byte-identical', () => {
    const body = '# Demo\n\n<!-- include: _partials/frag.md / -->\n\nSee `<!-- guidance-hook: x -->` for the shape.\n';

    expect(stripGuidanceHooks(body, SOURCE_LABEL)).toBe(body);
  });

  it('removes every declared hook', () => {
    const body = '<!-- guidance-hook: preferences -->\nProse.\n  <!-- guidance-hook: glossary -->  \nMore.';

    expect(stripGuidanceHooks(body, SOURCE_LABEL)).toBe('Prose.\nMore.');
  });

  it('rejects what listing rejects, so the grammar gates every render path', () => {
    expect(() => stripGuidanceHooks('<!-- guidance-hook: Mixed-Case -->', SOURCE_LABEL)).toThrow(GuidanceHookError);
    expect(() => stripGuidanceHooks('<!-- guidance-hook: dup -->\n<!-- guidance-hook: dup -->', SOURCE_LABEL)).toThrow(
      GuidanceHookError,
    );
  });
});

describe(isGuidanceHookName, () => {
  it('accepts a kebab-case, letter-led name', () => {
    expect(isGuidanceHookName('implementation-preferences')).toBe(true);
    expect(isGuidanceHookName('impl2')).toBe(true);
  });

  it('rejects a name the directive would also reject', () => {
    expect(isGuidanceHookName('Implementation-Preferences')).toBe(false);
    expect(isGuidanceHookName('2fast')).toBe(false);
    expect(isGuidanceHookName('impl_prefs')).toBe(false);
    expect(isGuidanceHookName('')).toBe(false);
  });
});

describe(fillGuidanceHooks, () => {
  it('splices a bound rulebook in place of the directive, attributed and wrapped', () => {
    const result = fillGuidanceHooks(
      'Before.\n\n<!-- guidance-hook: impl -->\n\nAfter.\n',
      bind({ impl: [layout] }),
      'skills/a/SKILL.md',
    );

    expect(result.content).toBe(
      [
        'Before.',
        '',
        '<!-- codeassembly-guidance-hook:impl:start -->',
        '<!-- rulebook:layout -->',
        '## Layout',
        '',
        'Group source by role.',
        '<!-- /rulebook:layout -->',
        '<!-- codeassembly-guidance-hook:impl:end -->',
        '',
        'After.',
        '',
      ].join('\n'),
    );
    expect(result.filled).toEqual([{ hook: 'impl', slugs: ['layout'] }]);
  });

  it('names the version of a bound rulebook that declares one', () => {
    const result = fillGuidanceHooks(
      '<!-- guidance-hook: impl -->\n',
      bind({ impl: [{ ...layout, version: '3' }] }),
      'a.md',
    );

    expect(result.content).toContain('<!-- rulebook:layout -->\n<!-- rulebook-version: 3 -->\n## Layout');
  });

  it('names no version for a bound rulebook that declares none', () => {
    const result = fillGuidanceHooks('<!-- guidance-hook: impl -->\n', bind({ impl: [layout] }), 'a.md');

    expect(result.content).not.toContain('rulebook-version');
  });

  it('removes an unbound directive, contributing nothing at all', () => {
    const result = fillGuidanceHooks(
      'Before.\n<!-- guidance-hook: impl -->\nAfter.\n',
      bind({ other: [layout] }),
      'a.md',
    );

    expect(result.content).toBe('Before.\nAfter.\n');
    expect(result.content).not.toContain('guidance-hook');
    expect(result.filled).toEqual([]);
  });

  it('splices multiple bindings in declaration order', () => {
    const result = fillGuidanceHooks('<!-- guidance-hook: impl -->\n', bind({ impl: [layout, types] }), 'a.md');

    expect(result.content.indexOf('rulebook:layout')).toBeLessThan(result.content.indexOf('rulebook:types'));
    expect(result.filled).toEqual([{ hook: 'impl', slugs: ['layout', 'types'] }]);
  });

  it('carries the stripped body alongside the filled one', () => {
    const result = fillGuidanceHooks(
      'Before.\n<!-- guidance-hook: impl -->\nAfter.\n',
      bind({ impl: [layout] }),
      'a.md',
    );

    expect(result.stripped).toBe('Before.\nAfter.\n');
  });

  it('re-renders byte-identically', () => {
    const source = 'Before.\n\n<!-- guidance-hook: impl -->\n\nAfter.\n';
    const fills = bind({ impl: [layout, types] });

    expect(fillGuidanceHooks(source, fills, 'a.md').content).toBe(fillGuidanceHooks(source, fills, 'a.md').content);
  });

  describe('heading demotion', () => {
    it('adds one level to each heading in a bound body', () => {
      const fills = bind({ impl: [{ slug: 'deep', body: '# One\n\n## Two\n\n### Three\n' }] });
      const result = fillGuidanceHooks('<!-- guidance-hook: impl -->\n', fills, 'a.md');

      expect(result.content).toContain('## One');
      expect(result.content).toContain('### Two');
      expect(result.content).toContain('#### Three');
    });

    it('leaves a hash inside a fenced code block untouched', () => {
      const fills = bind({ impl: [{ slug: 'fenced', body: '# Title\n\n```bash\n# not a heading\n```\n' }] });
      const result = fillGuidanceHooks('<!-- guidance-hook: impl -->\n', fills, 'a.md');

      expect(result.content).toContain('## Title');
      expect(result.content).toContain('\n# not a heading\n');
    });

    it('leaves an h6 at h6, since a seventh hash is no longer a heading', () => {
      const fills = bind({ impl: [{ slug: 'deepest', body: '###### Six\n' }] });

      expect(fillGuidanceHooks('<!-- guidance-hook: impl -->\n', fills, 'a.md').content).toContain('###### Six');
    });
  });

  it('rejects a directive inside the frontmatter block when a binding would fill it', () => {
    const source = '---\ntitle: a\n<!-- guidance-hook: impl -->\n---\n\nBody.\n';

    expect(() => fillGuidanceHooks(source, bind({ impl: [layout] }), 'subagents/a.md')).toThrow(
      /subagents\/a\.md:3.*fill-in-frontmatter/s,
    );
  });

  it('strips a directive inside the frontmatter block when nothing is bound', () => {
    const source = '---\ntitle: a\n<!-- guidance-hook: impl -->\n---\n\nBody.\n';

    expect(fillGuidanceHooks(source, bind({}), 'subagents/a.md').content).toBe('---\ntitle: a\n---\n\nBody.\n');
  });

  it('throws whatever listGuidanceHooks rejects before splicing anything', () => {
    expect(() => fillGuidanceHooks('<!-- guidance-hook: Bad_Name -->\n', bind({}), 'a.md')).toThrow(GuidanceHookError);
  });
});

describe(assertFilledAnchorsResolve, () => {
  it('passes when the combined body resolves every anchor', () => {
    const source = '[see](#layout)\n\n<!-- guidance-hook: impl -->\n';
    const result = fillGuidanceHooks(source, bind({ impl: [layout] }), 'a.md');

    expect(() => assertFilledAnchorsResolve(result, 'a.md')).not.toThrow();
  });

  it('attributes a collision the fill introduces to the binding that caused it', () => {
    const source = '## Layout\n\n[see](#layout)\n\n<!-- guidance-hook: impl -->\n';
    const result = fillGuidanceHooks(source, bind({ impl: [layout] }), 'a.md');

    expect(() => assertFilledAnchorsResolve(result, 'a.md')).toThrow(/binding introduced the failure: impl <- layout/);
  });

  it('reports a collision the host carried on its own without blaming a binding', () => {
    const source = '## Dup\n\n## Dup\n\n[see](#dup)\n\n<!-- guidance-hook: impl -->\n';
    const result = fillGuidanceHooks(source, bind({ impl: [types] }), 'a.md');

    expect(() => assertFilledAnchorsResolve(result, 'a.md')).toThrow(/names 2 headings/);
    expect(() => assertFilledAnchorsResolve(result, 'a.md')).not.toThrow(/binding introduced/);
  });
});

// region | Helpers

const layout = { slug: 'layout', body: '# Layout\n\nGroup source by role.\n' };
const types = { slug: 'types', body: '# Types\n\nExport by name.\n' };

/** Builds the fills map from a plain object, so a test names bindings without constructing a Map inline. */
function bind(bindings: Record<string, ReadonlyArray<GuidanceHookFill>>): GuidanceHookFills {
  return new Map(Object.entries(bindings));
}

// endregion | Helpers
