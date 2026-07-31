import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { extractSection, resolveEpisode } from '../resolve-episode.ts';
import {
  createLedeFixture,
  FIXTURE_AGENT_LEDE,
  FIXTURE_MERGED_LEDE,
  type LedeFixture,
  renderSection,
  writeArtifact,
} from '../test-utils/create-lede-fixture.ts';
import type { LedeEpisode, ResolveEpisodeOutcome } from '../types.ts';

describe(resolveEpisode, () => {
  it('resolves both ledes, the doctrine fingerprint, and the change identity', async () => {
    const fixture = await createLedeFixture();

    const episode = expectEpisode(await resolveEpisode(inputFor(fixture)));

    expect(episode.agentLede).toBe(FIXTURE_AGENT_LEDE);
    expect(episode.mergedLede).toBe(FIXTURE_MERGED_LEDE);
    expect(episode.doctrineHash).toMatch(/^sha256:[\da-f]{64}$/);
    expect(episode.identity).toMatchObject({ type: 'feat', tier: 'public', scope: 'agents', pr: '1124' });
  });

  it('reports the ledes as differing when the merged text was rewritten', async () => {
    const fixture = await createLedeFixture();

    expect((await resolveFor(fixture)).differ).toBe(true);
  });

  it('reports the ledes as identical when they differ only by whitespace', async () => {
    const fixture = await createLedeFixture({ mergedLede: `${FIXTURE_AGENT_LEDE.replace(' ', '\n  ')}\n` });

    expect((await resolveFor(fixture)).differ).toBe(false);
  });

  it('reads the newest artifact of each kind', async () => {
    const fixture = await createLedeFixture();
    await writeArtifact(fixture.artifactDir, '20260731-090000Z_later_merge.md', renderSection('Body', 'A later lede.'));

    expect((await resolveFor(fixture)).mergedLede).toBe('A later lede.');
  });

  it('finds an artifact nested in a run subdirectory', async () => {
    const fixture = await createLedeFixture();
    const runDir = join(fixture.artifactDir, '20260731-100000Z-run');
    await mkdir(runDir, { recursive: true });
    await writeArtifact(runDir, '20260731-100000Z_run_merge.md', renderSection('Body', 'A lede from a run.'));

    expect((await resolveFor(fixture)).mergedLede).toBe('A lede from a run.');
  });

  it('derives the tier from a work type declared as an alias', async () => {
    const fixture = await createLedeFixture();

    expect((await resolveFor(fixture, { type: 'feature' })).identity.tier).toBe('public');
  });

  it('falls back to the change summary for a type and scope the caller did not pass', async () => {
    const fixture = await createLedeFixture();
    const { type: _type, scope: _scope, ...withoutIdentity } = inputFor(fixture);

    const episode = expectEpisode(await resolveEpisode(withoutIdentity));

    expect(episode.identity).toMatchObject({ type: 'fix', scope: 'kb', ticket: '1107' });
  });

  it('reads a wholly numeric ticket id, which the change summary writes unquoted', async () => {
    const fixture = await createLedeFixture({ ticketId: '1107' });

    expect((await resolveFor(fixture)).identity.ticket).toBe('1107');
  });

  it('reads a prefixed ticket key, which the change summary writes as a string', async () => {
    const fixture = await createLedeFixture({ ticketId: 'MAC-42' });

    expect((await resolveFor(fixture)).identity.ticket).toBe('MAC-42');
  });

  it('reads a lede from an override file rather than its artifact', async () => {
    const fixture = await createLedeFixture();
    const overrideFile = join(fixture.root, 'override.md');
    await writeFile(overrideFile, '  A lede fetched from the forge.\n', 'utf8');

    const episode = expectEpisode(await resolveEpisode({ ...inputFor(fixture), mergedLedeFile: overrideFile }));

    expect(episode.mergedLede).toBe('A lede fetched from the forge.');
  });

  it('omits the agents version when the install manifest is unreadable', async () => {
    const fixture = await createLedeFixture();

    expect((await resolveFor(fixture)).agentsVersion).toBeUndefined();
  });

  it('reads the agents version from the install manifest', async () => {
    const fixture = await createLedeFixture();
    await writeFile(fixture.manifestPath, JSON.stringify({ shared: { version: '1.2.3' } }), 'utf8');

    expect((await resolveFor(fixture)).agentsVersion).toBe('1.2.3');
  });

  it('resolves the default manifest path against the caller-supplied home', async () => {
    const fixture = await createLedeFixture();
    const home = join(fixture.root, 'home');
    await mkdir(join(home, '.codeassembly'), { recursive: true });
    await writeFile(
      join(home, '.codeassembly', 'agents-manifest.json'),
      JSON.stringify({ shared: { version: '4.5.6' } }),
      'utf8',
    );
    const { manifestPath: _manifestPath, ...withoutManifest } = inputFor(fixture);

    const episode = expectEpisode(await resolveEpisode({ ...withoutManifest, home }));

    expect(episode.agentsVersion).toBe('4.5.6');
  });

  it('reports a missing artifact directory', async () => {
    const fixture = await createLedeFixture();

    const outcome = await resolveEpisode({ ...inputFor(fixture), artifactDir: join(fixture.root, 'absent') });

    expect(expectFailure(outcome)).toBe('no-artifact-dir');
  });

  it('reports an absent pull-request artifact separately from an absent merge artifact', async () => {
    const fixture = await createLedeFixture({ omit: 'pull-request' });

    const outcome = await resolveEpisode(inputFor(fixture));

    expect(expectFailure(outcome)).toBe('no-agent-lede');
  });

  it('reports a merge artifact carrying no body section', async () => {
    const fixture = await createLedeFixture({ mergedLede: '' });

    const outcome = await resolveEpisode(inputFor(fixture));

    expect(expectFailure(outcome)).toBe('no-merged-lede');
  });

  it('reports an unreadable doctrine file', async () => {
    const fixture = await createLedeFixture();
    await rm(join(fixture.dataDir, 'lede-voice.md'));

    const outcome = await resolveEpisode(inputFor(fixture));

    expect(expectFailure(outcome)).toBe('no-doctrine');
  });

  it('reports a work type the taxonomy does not declare', async () => {
    const fixture = await createLedeFixture();

    const outcome = await resolveEpisode(inputFor(fixture, { type: 'invented' }));

    expect(expectFailure(outcome)).toBe('unresolved-identity');
  });
});

describe(extractSection, () => {
  it('captures everything up to the next second-level heading', () => {
    const text = '## What\n\nThe lede.\n\n## Why\n\nThe motivation.\n';

    expect(extractSection({ text, heading: 'What' })).toBe('The lede.');
  });

  it('captures a nested third-level heading rather than stopping at it', () => {
    const text = '## Body\n\nLead.\n\n### Detail\n\nMore.\n\n## Next\n';

    expect(extractSection({ text, heading: 'Body' })).toBe('Lead.\n\n### Detail\n\nMore.');
  });

  it('captures the final section when no heading follows it', () => {
    const text = '# Title\n\n## Body\n\nThe lede.\n';

    expect(extractSection({ text, heading: 'Body' })).toBe('The lede.');
  });

  it('matches the heading without regard to case', () => {
    expect(extractSection({ text: '## WHAT\n\nThe lede.\n', heading: 'What' })).toBe('The lede.');
  });

  it('yields null for a heading the document does not carry', () => {
    expect(extractSection({ text: '## Why\n\nThe motivation.\n', heading: 'What' })).toBeNull();
  });

  it('yields null for a heading whose section holds no text', () => {
    expect(extractSection({ text: '## What\n\n## Why\n\nThe motivation.\n', heading: 'What' })).toBeNull();
  });
});

// region | Helpers

/** Narrows a resolver outcome to its success arm, failing the test with the reported reason when it is not one. */
function expectEpisode(outcome: ResolveEpisodeOutcome): LedeEpisode {
  if (outcome.ok) {
    return outcome.episode;
  }
  throw new Error(`expected a resolved episode, got ${outcome.error}: ${outcome.message}`);
}

/** Narrows a resolver outcome to its failure arm and yields the error code, failing the test when it succeeded. */
function expectFailure(outcome: ResolveEpisodeOutcome): string {
  if (outcome.ok) {
    throw new Error('expected the resolver to fail, but it resolved an episode');
  }
  return outcome.error;
}

/** Builds resolver input over a fixture, supplying the flags a merge caller would pass. */
function inputFor(fixture: LedeFixture, overrides: { type?: string } = {}): Parameters<typeof resolveEpisode>[0] {
  return {
    artifactDir: fixture.artifactDir,
    dataDir: fixture.dataDir,
    pr: '1124',
    mergeCommit: '35aa58d7',
    type: overrides.type ?? 'feat',
    scope: 'agents',
    manifestPath: fixture.manifestPath,
  };
}

/** Resolves an episode over a fixture and narrows it to the success arm, so an assertion reads as one call. */
async function resolveFor(fixture: LedeFixture, overrides: { type?: string } = {}): Promise<LedeEpisode> {
  return expectEpisode(await resolveEpisode(inputFor(fixture, overrides)));
}

// endregion | Helpers
