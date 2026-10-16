import { describe, expect, it } from 'vitest';

import { formatKbResolutionFailure } from '../format-kb-resolution-failure.ts';

describe(formatKbResolutionFailure, () => {
  it('names the requested KB for no-kb-resolvable', () => {
    const message = formatKbResolutionFailure({ ok: false, reason: 'no-kb-resolvable', requestedKb: 'ghost' });

    expect(message).toBe('--kb "ghost" does not match any registered knowledge base');
  });

  it('lists the registered KBs and the default for missing-destination', () => {
    const message = formatKbResolutionFailure({
      ok: false,
      reason: 'missing-destination',
      registeredKbs: ['alpha', 'beta'],
      defaultName: 'alpha',
    });

    expect(message).toContain('Registered knowledge bases: alpha, beta.');
    expect(message).toContain('--kb @default');
  });

  it('reports an unconfigured default for no-default without a registry error', () => {
    const message = formatKbResolutionFailure({ ok: false, reason: 'no-default' });

    expect(message).toBe('--kb @default was given but kb.yaml does not configure default_kb');
  });

  it('reports the registry error for no-default when the registry could not be loaded', () => {
    const message = formatKbResolutionFailure({ ok: false, reason: 'no-default', registryError: 'bad YAML' });

    expect(message).toBe('could not resolve the default knowledge base: bad YAML');
  });

  it('names the readonly KB for readonly-kb', () => {
    const message = formatKbResolutionFailure({
      ok: false,
      reason: 'readonly-kb',
      kbName: 'archive',
      kbPath: '/vaults/archive',
    });

    expect(message).toBe('knowledge base "archive" is marked readonly in kb.yaml; writes are refused');
  });
});
