import { describe, expect, it } from 'vitest';

import { loadKbRegistry } from '../../discovery/load-registry.ts';
import { getRegistryPathFor, makeTempDir, seedRegistry } from '../../test-utils/scaffolding.ts';
import { run } from '../run.ts';
import type { SelectKbChoice, SelectKbPrompt } from '../select-kb-prompt.ts';

const TWO_KBS = 'kbs:\n  coding:\n    path: /abs/coding\n  notes:\n    path: /abs/notes\n';

describe('kb set-default <name>', () => {
  it('sets default_kb to the named KB and confirms', async () => {
    const home = await seededHome(TWO_KBS);

    const result = await run({ argv: ['set-default', 'notes'], cwd: home, home });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('Default knowledge base has been set to "notes".\n');
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.defaultKb?.name).toBe('notes');
  });

  it('exits 2 and leaves the registry unchanged when the name is not registered', async () => {
    const home = await seededHome(`default_kb: coding\n${TWO_KBS}`);

    const result = await run({ argv: ['set-default', 'missing'], cwd: home, home });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('not a registered knowledge base');
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.defaultKb?.name).toBe('coding');
  });

  it('sets the current default again idempotently', async () => {
    const home = await seededHome(`default_kb: coding\n${TWO_KBS}`);

    const result = await run({ argv: ['set-default', 'coding'], cwd: home, home });

    expect(result.exitCode).toBe(0);
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.defaultKb?.name).toBe('coding');
  });
});

describe('kb set-default --none', () => {
  it('clears default_kb and confirms', async () => {
    const home = await seededHome(`default_kb: coding\n${TWO_KBS}`);

    const result = await run({ argv: ['set-default', '--none'], cwd: home, home });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('The default knowledge base has been cleared.\n');
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.defaultKb).toBeUndefined();
  });

  it('succeeds when no default is set', async () => {
    const home = await seededHome(TWO_KBS);

    const result = await run({ argv: ['set-default', '--none'], cwd: home, home });

    expect(result.exitCode).toBe(0);
  });

  it('exits 2 when combined with a name', async () => {
    const home = await seededHome(TWO_KBS);

    const result = await run({ argv: ['set-default', 'coding', '--none'], cwd: home, home });

    expect(result.exitCode).toBe(2);
  });
});

describe('kb set-default (interactive)', () => {
  it('sets the picked KB and reports the current default to the picker', async () => {
    const home = await seededHome(`default_kb: coding\n${TWO_KBS}`);
    const { prompt, calledWith } = stubPrompt({ kind: 'kb', index: 1 });

    const result = await run({ argv: ['set-default'], cwd: home, home, selectKb: prompt });

    expect(result.exitCode).toBe(0);
    expect(calledWith[0]?.currentDefaultName).toBe('coding');
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.defaultKb?.name).toBe('notes');
  });

  it('clears the default when (none) is chosen', async () => {
    const home = await seededHome(`default_kb: coding\n${TWO_KBS}`);
    const { prompt } = stubPrompt({ kind: 'none' });

    const result = await run({ argv: ['set-default'], cwd: home, home, selectKb: prompt });

    expect(result.exitCode).toBe(0);
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.defaultKb).toBeUndefined();
  });

  it('leaves the registry unchanged when cancelled', async () => {
    const home = await seededHome(`default_kb: coding\n${TWO_KBS}`);
    const { prompt } = stubPrompt({ kind: 'cancel' });

    const result = await run({ argv: ['set-default'], cwd: home, home, selectKb: prompt });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('No changes made.\n');
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.defaultKb?.name).toBe('coding');
  });

  it('exits 2 when stdin is not interactive (no picker supplied)', async () => {
    const home = await seededHome(TWO_KBS);

    const result = await run({ argv: ['set-default'], cwd: home, home });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('not interactive');
  });
});

describe('kb set-default error and help paths', () => {
  it('exits 2 directing to kb create when no KBs are registered (name form)', async () => {
    const home = await makeTempDir('kb-setdefault-home-');

    const result = await run({ argv: ['set-default', 'coding'], cwd: home, home });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('kb create');
  });

  it('exits 2 directing to kb create when no KBs are registered (interactive form)', async () => {
    const home = await makeTempDir('kb-setdefault-home-');
    const { prompt } = stubPrompt({ kind: 'cancel' });

    const result = await run({ argv: ['set-default'], cwd: home, home, selectKb: prompt });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('kb create');
  });

  it('exits 2 on an unknown flag', async () => {
    const home = await seededHome(TWO_KBS);

    const result = await run({ argv: ['set-default', '--bogus'], cwd: home, home });

    expect(result.exitCode).toBe(2);
  });

  it('prints command help with --help', async () => {
    const result = await run({ argv: ['set-default', '--help'], cwd: '/tmp', home: '/tmp' });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('kb set-default');
  });

  it('lists set-default in the top-level help', async () => {
    const result = await run({ argv: [], cwd: '/tmp', home: '/tmp' });

    expect(result.stdout).toContain('set-default');
  });
});

// region | Helpers

/** A stub picker that returns a fixed choice and records the input it was called with. */
function stubPrompt(choice: SelectKbChoice): { prompt: SelectKbPrompt; calledWith: { currentDefaultName?: string }[] } {
  const calledWith: { currentDefaultName?: string }[] = [];
  const prompt: SelectKbPrompt = (input) => {
    calledWith.push({
      ...(input.currentDefaultName !== undefined && { currentDefaultName: input.currentDefaultName }),
    });
    return Promise.resolve(choice);
  };
  return { prompt, calledWith };
}

async function seededHome(content: string): Promise<string> {
  const home = await makeTempDir('kb-setdefault-home-');
  await seedRegistry(getRegistryPathFor(home), content);
  return home;
}

// endregion | Helpers
