import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveEventPath } from '../resolve-event-path.ts';

const HOME = '/home/agent';

/** The events root every resolved path hangs under. */
const ROOT = path.join(HOME, '.codeassembly', 'events');

describe(resolveEventPath, () => {
  it('resolves the full path from a complete context', () => {
    expect(
      resolveEventPath({ home: HOME, repo: 'williamthorsen/codeassembly', branch: 'main', session: 'abc123' }),
    ).toBe(path.join(ROOT, 'williamthorsen', 'codeassembly', 'main', 'abc123.jsonl'));
  });

  it('sanitizes the branch the way the branch manifest does', () => {
    // The branch segment must agree with the on-disk spelling the branch manifest uses, so a reader can line up an
    // event log with the artifacts of the branch that produced it.
    const resolved = resolveEventPath({ home: HOME, repo: 'owner/name', branch: 'MAC-42/feat/thing', session: 's' });

    expect(resolved).toBe(path.join(ROOT, 'owner', 'name', 'MAC-42-feat-thing', 's.jsonl'));
  });

  it('substitutes both repo segments when the repo is unresolvable', () => {
    expect(resolveEventPath({ home: HOME, branch: 'main', session: 's' })).toBe(
      path.join(ROOT, '_no-repo', '_no-repo', 'main', 's.jsonl'),
    );
  });

  it('substitutes the branch placeholder when the branch is unresolvable', () => {
    expect(resolveEventPath({ home: HOME, repo: 'owner/name', session: 's' })).toBe(
      path.join(ROOT, 'owner', 'name', '_no-branch', 's.jsonl'),
    );
  });

  it('substitutes the session placeholder when the session is unresolvable', () => {
    expect(resolveEventPath({ home: HOME, repo: 'owner/name', branch: 'main' })).toBe(
      path.join(ROOT, 'owner', 'name', 'main', '_no-session.jsonl'),
    );
  });

  it('falls back to placeholders when every field is unresolvable', () => {
    expect(resolveEventPath({ home: HOME })).toBe(
      path.join(ROOT, '_no-repo', '_no-repo', '_no-branch', '_no-session.jsonl'),
    );
  });

  it('flattens path separators in the session so it cannot redirect the write', () => {
    // A relaying harness supplies `--session` verbatim; a value carrying separators must stay one filename inside the
    // session directory rather than climbing out of the events root.
    const resolved = resolveEventPath({ home: HOME, repo: 'owner/name', branch: 'main', session: '../../escape' });

    expect(resolved).toBe(path.join(ROOT, 'owner', 'name', 'main', '..-..-escape.jsonl'));
  });

  it('substitutes the placeholder for a segment of dots only', () => {
    expect(resolveEventPath({ home: HOME, repo: 'owner/name', branch: 'main', session: '..' })).toBe(
      path.join(ROOT, 'owner', 'name', 'main', '_no-session.jsonl'),
    );
  });

  it('substitutes the placeholder for a repo that is not owner/name', () => {
    expect(resolveEventPath({ home: HOME, repo: 'bare-name', branch: 'main', session: 's' })).toBe(
      path.join(ROOT, 'bare-name', '_no-repo', 'main', 's.jsonl'),
    );
  });
});
