import { describe, expect, it } from 'vitest';

import { GuidanceHookError, isGuidanceHookName, listGuidanceHooks, stripGuidanceHooks } from '../guidance-hooks.ts';

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
