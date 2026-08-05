import { describe, expect, it, vi } from 'vitest';

import { canonicalizeTags } from '../apply/canonicalize-tags.ts';

describe(canonicalizeTags, () => {
  it('invokes kb-edit in the next-argv --retag form with comma-joined current tags', async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });

    await canonicalizeTags({
      notePath: '/vault/Note.md',
      currentTags: ['vcs', 'react'],
      kbEditPath: '/skills/kb-edit/kb-edit.mjs',
      run,
    });

    expect(run).toHaveBeenCalledWith(['/skills/kb-edit/kb-edit.mjs', '/vault/Note.md', '--retag', 'vcs,react']);
  });

  it('returns ok: true with the kb-edit --retag operation on success', async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });

    const fix = await canonicalizeTags({ notePath: '/vault/Note.md', currentTags: ['x'], kbEditPath: '/k.mjs', run });

    expect(fix).toEqual({
      path: '/vault/Note.md',
      rule: 'tag-alias',
      ok: true,
      operation: 'kb-edit --retag',
    });
  });

  it('returns ok: false without throwing when kb-edit fails', async () => {
    const run = vi.fn().mockResolvedValue({ ok: false, message: 'kb-edit exited 1' });

    const fix = await canonicalizeTags({ notePath: '/vault/Note.md', currentTags: ['x'], kbEditPath: '/k.mjs', run });

    expect(fix.ok).toBe(false);
    expect(fix.operation).toBe('kb-edit --retag');
    expect(fix.message).toContain('kb-edit exited 1');
  });

  it('fails with a clear message when the sibling kb-edit.mjs is absent', async () => {
    const run = vi.fn();

    const fix = await canonicalizeTags({ notePath: '/vault/Note.md', currentTags: ['x'], kbEditPath: null, run });

    expect(fix.ok).toBe(false);
    expect(fix.message).toContain('kb-edit.mjs not found');
    expect(run).not.toHaveBeenCalled();
  });
});
