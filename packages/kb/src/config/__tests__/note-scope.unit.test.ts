import { describe, expect, it } from 'vitest';

import { defaultKbConfig, type KbConfig } from '../config-schema.ts';
import { createNoteScopeMatcher } from '../note-scope.ts';

describe(createNoteScopeMatcher, () => {
  it('classifies a note under the default targets and rejects a root non-note', () => {
    const matcher = createNoteScopeMatcher(defaultKbConfig);

    expect(matcher.isNote('content/howto/deploy.md')).toBe(true);
    expect(matcher.isNote('README.md')).toBe(false);
  });

  it('treats a dot-directory path as outside the note set', () => {
    const matcher = createNoteScopeMatcher(defaultKbConfig);

    // `dot:false` keeps `**`/`*` from matching dot-segments, so a path under `.kb` is never a note.
    expect(matcher.isNote('.kb/config.md')).toBe(false);
  });

  it('lets an exclude override a matching target', () => {
    const config: KbConfig = { targets: ['content/**/*.md'], exclude: ['content/drafts/**'] };
    const matcher = createNoteScopeMatcher(config);

    expect(matcher.isTarget('content/drafts/wip.md')).toBe(true);
    expect(matcher.isExcluded('content/drafts/wip.md')).toBe(true);
    expect(matcher.isNote('content/drafts/wip.md')).toBe(false);
    expect(matcher.isNote('content/published.md')).toBe(true);
  });

  it('honors a custom whole-tree target', () => {
    const config: KbConfig = { targets: ['**/*.md'], exclude: ['**/node_modules/**'] };
    const matcher = createNoteScopeMatcher(config);

    expect(matcher.isNote('notes/2024-archive/runbook.md')).toBe(true);
    expect(matcher.isNote('root-note.md')).toBe(true);
    expect(matcher.isNote('vendor/node_modules/pkg/readme.md')).toBe(false);
  });
});
