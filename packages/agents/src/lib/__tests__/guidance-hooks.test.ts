import { describe, expect, it } from 'vitest';

import { GuidanceHookError, listGuidanceHooks, stripGuidanceHooks } from '../guidance-hooks.ts';

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
    expect(() => listGuidanceHooks(body, SOURCE_LABEL)).toThrowError(
      expect.objectContaining({ reason: 'duplicate-hook' }),
    );
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
