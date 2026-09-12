import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getHomeProvenancePath, recordHomeProvenance } from '../../lib/home-provenance.ts';
import { readRunningPackageVersion } from '../../lib/running-package.ts';
import { resolveEpisode } from '../resolve-episode.ts';
import {
  createLedeFixture,
  FIXTURE_AGENT_LEDE,
  FIXTURE_DOCTRINE_FILENAMES,
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

  it('records the canonical key for a type spelled as an alias', async () => {
    const fixture = await createLedeFixture();

    expect((await resolveFor(fixture, { type: 'feature' })).identity.type).toBe('feat');
  });

  it('resolves a work type carrying the breaking marker and reports the marker', async () => {
    const fixture = await createLedeFixture();

    expect((await resolveFor(fixture, { type: 'feat!' })).identity).toMatchObject({
      type: 'feat',
      tier: 'public',
      breaking: true,
    });
  });

  it('reports no marker for a work type spelled without one', async () => {
    const fixture = await createLedeFixture();

    expect((await resolveFor(fixture, { type: 'feat' })).identity.breaking).toBe(false);
  });

  it('falls back to the change summary for a type and scope the caller did not pass', async () => {
    const fixture = await createLedeFixture();

    expect((await resolveWithoutIdentity(fixture)).identity).toMatchObject({
      type: 'fix',
      scope: 'kb',
      ticket: '1107',
    });
  });

  it.each([
    ['as a field', 'type: feat\nbreaking: true'],
    ['as an override', 'type: feat\nbreaking_override: true'],
    ['as a marker spelled on the type', 'type: feat!'],
  ])('when the change summary records breaking %s, resolves the fallback type as breaking', async (_label, fields) => {
    const fixture = await createLedeFixture();
    await writeChangeSummary(fixture, `${fields}\nscope: agents`);

    expect((await resolveWithoutIdentity(fixture)).identity).toMatchObject({ type: 'feat', breaking: true });
  });

  it('when the change summary records overrides, takes them over the derived head', async () => {
    const fixture = await createLedeFixture();
    await writeChangeSummary(fixture, 'type: fix\nscope: kb\ntype_override: feat\nscope_override: agents');

    expect((await resolveWithoutIdentity(fixture)).identity).toMatchObject({ type: 'feat', scope: 'agents' });
  });

  it('when the caller passes --type, ignores the change summary’s breaking fields', async () => {
    const fixture = await createLedeFixture();
    await writeChangeSummary(fixture, 'type: feat\nbreaking: true\nscope: agents');

    expect((await resolveFor(fixture, { type: 'feat' })).identity.breaking).toBe(false);
  });

  it('records breaking from --breaking', async () => {
    const fixture = await createLedeFixture();

    expect((await resolveFor(fixture, { breaking: true })).identity).toMatchObject({ type: 'feat', breaking: true });
  });

  it('where the flags name the identity, records no scope even though the change summary names one', async () => {
    const fixture = await createLedeFixture();

    const episode = await resolveFor(fixture, { scope: null });

    expect(episode.identity).toMatchObject({ type: 'feat', ticket: '1107' });
    expect(episode.identity).not.toHaveProperty('scope');
  });

  it.each([
    ['--scope', { scope: 'agents', type: null }],
    ['--breaking', { breaking: true, scope: null, type: null }],
  ] as const)('where %s is passed without --type, reports that --type is required', async (_flag, overrides) => {
    const fixture = await createLedeFixture();

    const outcome = await resolveEpisode(inputFor(fixture, overrides));

    expect(expectFailure(outcome)).toStrictEqual({
      error: 'unresolved-identity',
      message: expect.stringContaining('pass --type'),
    });
  });

  it('reads a scope of * from the flags as no scope', async () => {
    const fixture = await createLedeFixture();

    expect((await resolveFor(fixture, { scope: '*' })).identity).not.toHaveProperty('scope');
  });

  it('reads a scope override of * from the change summary as no scope', async () => {
    const fixture = await createLedeFixture();
    await writeChangeSummary(fixture, "type: feat\nscope: agents\nscope_override: '*'");

    expect((await resolveWithoutIdentity(fixture)).identity).not.toHaveProperty('scope');
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

  it('omits the agents version when no provenance stamp is there', async () => {
    const fixture = await createLedeFixture();

    expect((await resolveFor(fixture)).agentsVersion).toBeUndefined();
  });

  // Written by `recordHomeProvenance` rather than as a literal, so a change to the stamp's shape fails here instead of
  // leaving the read against a shape nothing writes.
  it('reads the agents version from the home-provenance stamp', async () => {
    const fixture = await createLedeFixture();
    const home = join(fixture.root, 'home');
    await recordHomeProvenance('install', home);
    const { provenancePath: _provenancePath, ...withoutProvenance } = inputFor(fixture);

    const episode = expectEpisode(await resolveEpisode({ ...withoutProvenance, home }));

    expect(episode.agentsVersion).toBe(readRunningPackageVersion());
  });

  it('reads a stamp at an explicitly supplied path', async () => {
    const fixture = await createLedeFixture();
    await recordHomeProvenance('install', fixture.root);
    await rename(getHomeProvenancePath(fixture.root), fixture.provenancePath);

    expect((await resolveFor(fixture)).agentsVersion).toBe(readRunningPackageVersion());
  });

  it('reports no version when the stamp is malformed', async () => {
    const fixture = await createLedeFixture();
    await writeFile(fixture.provenancePath, '{ not json', 'utf8');

    expect((await resolveFor(fixture)).agentsVersion).toBeUndefined();
  });

  it('reports a missing artifact directory', async () => {
    const fixture = await createLedeFixture();

    const outcome = await resolveEpisode({ ...inputFor(fixture), artifactDir: join(fixture.root, 'absent') });

    expect(expectFailure(outcome).error).toBe('no-artifact-dir');
  });

  it('reports an absent pull-request artifact separately from an absent merge artifact', async () => {
    const fixture = await createLedeFixture({ omit: 'pull-request' });

    const outcome = await resolveEpisode(inputFor(fixture));

    expect(expectFailure(outcome).error).toBe('no-agent-lede');
  });

  it('reports a merge artifact carrying no body section', async () => {
    const fixture = await createLedeFixture({ mergedLede: '' });

    const outcome = await resolveEpisode(inputFor(fixture));

    expect(expectFailure(outcome).error).toBe('no-merged-lede');
  });

  it.each(FIXTURE_DOCTRINE_FILENAMES)('reports %s as an unreadable doctrine file', async (filename) => {
    const fixture = await createLedeFixture();
    const doctrinePath = join(fixture.subagentsDir, filename);
    await rm(doctrinePath);

    const outcome = await resolveEpisode(inputFor(fixture));

    // The digest covers several bodies, so a caller told only the code cannot tell which one to reinstall.
    expect(expectFailure(outcome)).toStrictEqual({
      error: 'no-doctrine',
      message: expect.stringContaining(doctrinePath),
    });
  });

  it.each(FIXTURE_DOCTRINE_FILENAMES)('moves the fingerprint when %s changes', async (filename) => {
    const fixture = await createLedeFixture();
    const before = (await resolveFor(fixture)).doctrineHash;
    await writeFile(join(fixture.subagentsDir, filename), 'Revised doctrine text.\n', 'utf8');

    expect((await resolveFor(fixture)).doctrineHash).not.toBe(before);
  });

  it('reports a work type the taxonomy does not declare', async () => {
    const fixture = await createLedeFixture();

    const outcome = await resolveEpisode(inputFor(fixture, { type: 'invented' }));

    expect(expectFailure(outcome).error).toBe('unresolved-identity');
  });

  it('reports an undeclared work type carrying the marker, which declares nothing on its own', async () => {
    const fixture = await createLedeFixture();

    const outcome = await resolveEpisode(inputFor(fixture, { type: 'invented!' }));

    expect(expectFailure(outcome).error).toBe('unresolved-identity');
  });

  it('reports an unreadable taxonomy apart from an undeclared type, which passing a flag would not repair', async () => {
    const fixture = await createLedeFixture({ omit: 'work-types' });

    const outcome = await resolveEpisode(inputFor(fixture));

    expect(expectFailure(outcome).error).toBe('no-taxonomy');
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

/** Narrows a resolver outcome to its failure arm and yields its code and message, failing the test when it succeeded. */
function expectFailure(outcome: ResolveEpisodeOutcome): { error: string; message: string } {
  if (outcome.ok) {
    throw new Error('expected the resolver to fail, but it resolved an episode');
  }
  return { error: outcome.error, message: outcome.message };
}

/**
 * Builds resolver input over a fixture, supplying the flags a merge caller would pass. A `null` type or scope leaves
 * that flag out.
 */
function inputFor(fixture: LedeFixture, overrides: IdentityFlags = {}): Parameters<typeof resolveEpisode>[0] {
  const type = overrides.type === undefined ? 'feat' : overrides.type;
  const scope = overrides.scope === undefined ? 'agents' : overrides.scope;
  return {
    artifactDir: fixture.artifactDir,
    dataDir: fixture.dataDir,
    subagentsDir: fixture.subagentsDir,
    pr: '1124',
    mergeCommit: '35aa58d7',
    ...(type !== null && { type }),
    ...(scope !== null && { scope }),
    ...(overrides.breaking !== undefined && { breaking: overrides.breaking }),
    provenancePath: fixture.provenancePath,
  };
}

/** The identity flags a test passes, where `null` leaves a flag out that `inputFor` would otherwise supply. */
interface IdentityFlags {
  breaking?: boolean;
  scope?: string | null;
  type?: string | null;
}

/** Resolves an episode over a fixture and narrows it to the success arm, so an assertion reads as one call. */
async function resolveFor(fixture: LedeFixture, overrides: IdentityFlags = {}): Promise<LedeEpisode> {
  return expectEpisode(await resolveEpisode(inputFor(fixture, overrides)));
}

/** Resolves an episode passing neither `--type` nor `--scope`, so both come from the change summary. */
async function resolveWithoutIdentity(fixture: LedeFixture): Promise<LedeEpisode> {
  const { type: _type, scope: _scope, ...withoutIdentity } = inputFor(fixture);
  return expectEpisode(await resolveEpisode(withoutIdentity));
}

/** Writes a change summary newer than the fixture's own, carrying `fields` as its frontmatter. */
async function writeChangeSummary(fixture: LedeFixture, fields: string): Promise<void> {
  await writeArtifact(
    fixture.artifactDir,
    '20260731-090000Z_later_change-summary.md',
    `---\n${fields}\n---\n\n# Title\n`,
  );
}

// endregion | Helpers
