import { join } from 'node:path';
import process from 'node:process';

import { describe, expect, it, vi } from 'vitest';

import { resolveWritableKb } from '../resolve-writable-kb.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const PROJECT_KB = join(FIXTURES, 'project-kb');
const DISCOVERED_KB = join(FIXTURES, 'discovered-kb');
const VAULT_A = join(FIXTURES, 'vault-a');
const VAULT_B = join(FIXTURES, 'vault-b');
const VAULT_READONLY = join(FIXTURES, 'vault-readonly');
const HOME_WITH_DEFAULT = join(FIXTURES, 'home-with-default');
const HOME_DEFAULT_NAMED = join(FIXTURES, 'home-default-named');
const HOME_MALFORMED = join(FIXTURES, 'malformed-registry');
const HOME_READONLY_DEFAULT = join(FIXTURES, 'home-readonly-default');
const HOME_READONLY_NAMED = join(FIXTURES, 'home-readonly-named');
const HOME_SINGLE_DEFAULT = join(FIXTURES, 'home-single-default');
const HOME_UNRESOLVABLE_DEFAULT = join(FIXTURES, 'home-unresolvable-default');
// A home directory with no `.agents/kb.yaml`, so the user-global registry resolves empty.
const HOME_EMPTY = FIXTURES;

describe(resolveWritableKb, () => {
  it('returns the discovered KB when one is found, preferring it over registry-default', async () => {
    const result = await resolveWritableKb({ startDir: PROJECT_KB, explicitKb: null, home: HOME_EMPTY });

    expect(result).toEqual({
      ok: true,
      kb: { name: null, path: PROJECT_KB, source: 'discovered' },
    });
  });

  it('annotates a discovered KB with its registry name when its path matches a registered entry', async () => {
    // VAULT_A is registered in HOME_WITH_DEFAULT as `named-vault-a`. Discovery from VAULT_A returns VAULT_A,
    // whose absolute path then matches the registry entry, so `name` is populated rather than null.
    const result = await resolveWritableKb({ startDir: VAULT_A, explicitKb: null, home: HOME_WITH_DEFAULT });

    expect(result).toEqual({
      ok: true,
      kb: { name: 'named-vault-a', path: VAULT_A, source: 'discovered' },
    });
  });

  it('returns name: null for a discovered KB whose path is not in the registry', async () => {
    // DISCOVERED_KB is not registered in HOME_WITH_DEFAULT, so the discovered match has no registry entry
    // and the name falls back to null.
    const result = await resolveWritableKb({ startDir: DISCOVERED_KB, explicitKb: null, home: HOME_WITH_DEFAULT });

    expect(result).toEqual({
      ok: true,
      kb: { name: null, path: DISCOVERED_KB, source: 'discovered' },
    });
  });

  it('resolves the @default sentinel to the configured default_kb', async () => {
    const result = await resolveWritableKb({ startDir: '/', explicitKb: '@default', home: HOME_WITH_DEFAULT });

    expect(result).toEqual({
      ok: true,
      kb: { name: 'global-vault', path: VAULT_B, source: 'registry-default' },
    });
  });

  it('resolves @default to the registry default, overriding a discovered .kb/', async () => {
    // DISCOVERED_KB has a `.kb/` marker, but the explicit sentinel beats discovery just as a concrete --kb name does,
    // so the registry default is selected rather than the discovered KB.
    const result = await resolveWritableKb({
      startDir: DISCOVERED_KB,
      explicitKb: '@default',
      home: HOME_WITH_DEFAULT,
    });

    expect(result).toEqual({
      ok: true,
      kb: { name: 'global-vault', path: VAULT_B, source: 'registry-default' },
    });
  });

  it('treats --kb default as a concrete name, resolving the KB named "default" not the sentinel target', async () => {
    const result = await resolveWritableKb({ startDir: '/', explicitKb: 'default', home: HOME_DEFAULT_NAMED });

    expect(result).toEqual({
      ok: true,
      kb: { name: 'default', path: VAULT_A, source: 'explicit' },
    });
  });

  it('resolves @default to the configured default even when a KB named "default" is registered', async () => {
    const result = await resolveWritableKb({ startDir: '/', explicitKb: '@default', home: HOME_DEFAULT_NAMED });

    expect(result).toEqual({
      ok: true,
      kb: { name: 'other-vault', path: VAULT_B, source: 'registry-default' },
    });
  });

  it('returns no-default when @default is given but no default_kb is configured', async () => {
    const result = await resolveWritableKb({ startDir: '/', explicitKb: '@default', home: HOME_EMPTY });

    expect(result).toEqual({ ok: false, reason: 'no-default' });
  });

  it('refuses a readonly default_kb reached via @default', async () => {
    const result = await resolveWritableKb({ startDir: '/', explicitKb: '@default', home: HOME_READONLY_DEFAULT });

    expect(result).toEqual({
      ok: false,
      reason: 'readonly-kb',
      kbName: 'readonly-default',
      kbPath: VAULT_READONLY,
    });
  });

  it('resolves a readonly default_kb for a caller that does not require a writable one', async () => {
    const result = await resolveWritableKb({
      startDir: '/',
      explicitKb: '@default',
      requireWritable: false,
      home: HOME_READONLY_DEFAULT,
    });

    expect(result).toEqual({
      ok: true,
      kb: { name: 'readonly-default', path: VAULT_READONLY, source: 'registry-default' },
    });
  });

  it('carries the registry error when @default names an unresolvable default_kb', async () => {
    // The unresolvable default_kb makes tryLoadKbRegistry surface an error, which resolveWritableKb also logs to
    // stderr; spy on it so the warning does not pollute test output.
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const result = await resolveWritableKb({
        startDir: '/',
        explicitKb: '@default',
        home: HOME_UNRESOLVABLE_DEFAULT,
      });

      expect(result).toEqual({
        ok: false,
        reason: 'no-default',
        registryError: expect.stringMatching(/default_kb "ghost" does not match any registered KB/),
      });
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('returns the explicit KB when --kb names a registered entry, overriding discovery and default', async () => {
    const result = await resolveWritableKb({ startDir: PROJECT_KB, explicitKb: 'vault-b', home: HOME_EMPTY });

    expect(result).toEqual({
      ok: true,
      kb: { name: 'vault-b', path: VAULT_B, source: 'explicit' },
    });
  });

  it('resolves --kb for a single-entry registry whose sole entry is the default (regression: #684)', async () => {
    const result = await resolveWritableKb({ startDir: '/', explicitKb: 'coding', home: HOME_SINGLE_DEFAULT });

    expect(result).toEqual({
      ok: true,
      kb: { name: 'coding', path: VAULT_B, source: 'explicit' },
    });
  });

  it('returns no-kb-resolvable when --kb names an entry that does not exist', async () => {
    const result = await resolveWritableKb({ startDir: PROJECT_KB, explicitKb: 'nonexistent', home: HOME_EMPTY });

    expect(result).toEqual({ ok: false, reason: 'no-kb-resolvable', requestedKb: 'nonexistent' });
  });

  it('refuses with missing-destination, naming the registered KBs and the default, when no .kb/ and no --kb', async () => {
    const result = await resolveWritableKb({ startDir: '/', explicitKb: null, home: HOME_WITH_DEFAULT });

    expect(result).toEqual({
      ok: false,
      reason: 'missing-destination',
      registeredKbs: ['global-vault', 'named-vault-a'],
      defaultName: 'global-vault',
    });
  });

  it('refuses with missing-destination and an empty list when no .kb/, no --kb, and the registry is empty', async () => {
    const result = await resolveWritableKb({ startDir: '/', explicitKb: null, home: HOME_EMPTY });

    expect(result).toEqual({ ok: false, reason: 'missing-destination', registeredKbs: [] });
  });

  it('uses the discovered KB even when a registry default is also configured', async () => {
    const result = await resolveWritableKb({ startDir: DISCOVERED_KB, explicitKb: null, home: HOME_WITH_DEFAULT });

    expect(result).toEqual({
      ok: true,
      kb: { name: null, path: DISCOVERED_KB, source: 'discovered' },
    });
  });

  it('degrades a malformed user-global registry to an empty config rather than throwing', async () => {
    // HOME_MALFORMED contains a syntactically invalid `.agents/kb.yaml`. The helper must swallow the parse
    // error and surface a structured result — here, the no-kb-resolvable failure for a startDir with no `.kb/`
    // marker — rather than letting the throw escape `resolveWritableKb`.
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const result = await resolveWritableKb({ startDir: '/', explicitKb: null, home: HOME_MALFORMED });

      expect(result).toEqual({
        ok: false,
        reason: 'missing-destination',
        registeredKbs: [],
        registryError: expect.any(String),
      });

      const warningLine = stderrSpy.mock.calls
        .map((call) => call[0])
        .find((arg): arg is string => typeof arg === 'string' && arg.includes('could not load kb.yaml registry:'));
      expect(warningLine).toMatch(/could not load kb\.yaml registry:/);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('degrades a malformed user-global registry while still honoring a discovered KB', async () => {
    // Even with a malformed registry, discovery should still succeed and the result should not throw.
    const result = await resolveWritableKb({ startDir: DISCOVERED_KB, explicitKb: null, home: HOME_MALFORMED });

    expect(result).toEqual({
      ok: true,
      kb: { name: null, path: DISCOVERED_KB, source: 'discovered' },
    });
  });

  it('does not reach a readonly registry-default via the null path, refusing with missing-destination', async () => {
    // Without `--kb @default` the registry default is never selected, so a readonly default is not even reached: the
    // null path refuses outright rather than surfacing readonly-kb.
    const result = await resolveWritableKb({ startDir: FIXTURES, explicitKb: null, home: HOME_READONLY_DEFAULT });

    expect(result).toEqual({
      ok: false,
      reason: 'missing-destination',
      registeredKbs: ['readonly-default', 'also-writable'],
      defaultName: 'readonly-default',
    });
  });

  it('refuses an explicit --kb that names a readonly entry with readonly-kb', async () => {
    const result = await resolveWritableKb({
      startDir: FIXTURES,
      explicitKb: 'readonly-named',
      home: HOME_READONLY_NAMED,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'readonly-kb',
      kbName: 'readonly-named',
      kbPath: VAULT_READONLY,
    });
  });

  it('resolves an explicit --kb naming a readonly entry for a caller that does not require a writable one', async () => {
    const result = await resolveWritableKb({
      startDir: FIXTURES,
      explicitKb: 'readonly-named',
      requireWritable: false,
      home: HOME_READONLY_NAMED,
    });

    expect(result).toEqual({
      ok: true,
      kb: { name: 'readonly-named', path: VAULT_READONLY, source: 'explicit' },
    });
  });

  it('refuses a discovered KB whose path matches a readonly registry entry with readonly-kb', async () => {
    // VAULT_READONLY is registered as `readonly-named` (readonly: true) in HOME_READONLY_NAMED. Discovery from
    // VAULT_READONLY returns its own path, which then matches the readonly registry entry.
    const result = await resolveWritableKb({
      startDir: VAULT_READONLY,
      explicitKb: null,
      home: HOME_READONLY_NAMED,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'readonly-kb',
      kbName: 'readonly-named',
      kbPath: VAULT_READONLY,
    });
  });

  it('resolves a discovered readonly KB for a caller that does not require a writable one', async () => {
    const result = await resolveWritableKb({
      startDir: VAULT_READONLY,
      explicitKb: null,
      requireWritable: false,
      home: HOME_READONLY_NAMED,
    });

    expect(result).toEqual({
      ok: true,
      kb: { name: 'readonly-named', path: VAULT_READONLY, source: 'discovered' },
    });
  });

  it('allows an explicit --kb naming the writable entry when a readonly default also exists', async () => {
    const result = await resolveWritableKb({
      startDir: FIXTURES,
      explicitKb: 'also-writable',
      home: HOME_READONLY_DEFAULT,
    });

    expect(result).toEqual({
      ok: true,
      kb: { name: 'also-writable', path: VAULT_B, source: 'explicit' },
    });
  });
});
