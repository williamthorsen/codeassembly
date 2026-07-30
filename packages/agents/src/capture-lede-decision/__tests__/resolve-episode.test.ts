import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { extractSection, resolveEpisode } from '../resolve-episode.ts';
import type { LedeEpisode, ResolveEpisodeOutcome } from '../types.ts';

const AGENT_LEDE = 'Rulebooks can now address a file by linking to it.';
const MERGED_LEDE = 'Rulebooks can now address a file by linking to it: a Markdown link reaches each harness.';

describe(resolveEpisode, () => {
  it('resolves both ledes, the doctrine fingerprint, and the change identity', async () => {
    const fixture = await createFixture({});

    const episode = expectEpisode(await resolveEpisode(fixture.input));

    expect(episode.agentLede).toBe(AGENT_LEDE);
    expect(episode.mergedLede).toBe(MERGED_LEDE);
    expect(episode.doctrineHash).toMatch(/^sha256:[\da-f]{64}$/);
    expect(episode.identity).toMatchObject({ type: 'feat', tier: 'public', scope: 'agents', pr: '1124' });
  });

  it('reports the ledes as differing when the merged text was rewritten', async () => {
    const fixture = await createFixture({});

    expect(expectEpisode(await resolveEpisode(fixture.input)).differ).toBe(true);
  });

  it('reports the ledes as identical when they differ only by whitespace', async () => {
    const fixture = await createFixture({ mergedLede: `${AGENT_LEDE.replace(' ', '\n  ')}\n` });

    expect(expectEpisode(await resolveEpisode(fixture.input)).differ).toBe(false);
  });

  it('reads the newest artifact of each kind', async () => {
    const fixture = await createFixture({});
    await writeArtifact(fixture.artifactDir, '20260731-090000Z_later_merge.md', section('Body', 'A later lede.'));

    expect(expectEpisode(await resolveEpisode(fixture.input)).mergedLede).toBe('A later lede.');
  });

  it('finds an artifact nested in a run subdirectory', async () => {
    const fixture = await createFixture({});
    const runDir = join(fixture.artifactDir, '20260731-100000Z-run');
    await mkdir(runDir, { recursive: true });
    await writeArtifact(runDir, '20260731-100000Z_run_merge.md', section('Body', 'A lede from a run.'));

    expect(expectEpisode(await resolveEpisode(fixture.input)).mergedLede).toBe('A lede from a run.');
  });

  it('derives the tier from a work type declared as an alias', async () => {
    const fixture = await createFixture({ type: 'feature' });

    expect(expectEpisode(await resolveEpisode(fixture.input)).identity.tier).toBe('public');
  });

  it('falls back to the change summary for a type and scope the caller did not pass', async () => {
    const fixture = await createFixture({});
    const { type: _type, scope: _scope, ...withoutIdentity } = fixture.input;

    const episode = expectEpisode(await resolveEpisode(withoutIdentity));

    expect(episode.identity).toMatchObject({ type: 'fix', scope: 'kb' });
  });

  it('reads a lede from an override file rather than its artifact', async () => {
    const fixture = await createFixture({});
    const overrideFile = join(fixture.root, 'override.md');
    await writeFile(overrideFile, '  A lede fetched from the forge.\n', 'utf8');

    const episode = expectEpisode(await resolveEpisode({ ...fixture.input, mergedLedeFile: overrideFile }));

    expect(episode.mergedLede).toBe('A lede fetched from the forge.');
  });

  it('omits the agents version when the install manifest is unreadable', async () => {
    const fixture = await createFixture({});

    const episode = expectEpisode(
      await resolveEpisode({ ...fixture.input, manifestPath: join(fixture.root, 'absent.json') }),
    );

    expect(episode.agentsVersion).toBeUndefined();
  });

  it('reads the agents version from the install manifest', async () => {
    const fixture = await createFixture({});
    const manifestPath = join(fixture.root, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify({ shared: { version: '1.2.3' } }), 'utf8');

    expect(expectEpisode(await resolveEpisode({ ...fixture.input, manifestPath })).agentsVersion).toBe('1.2.3');
  });

  it('reports a missing artifact directory', async () => {
    const fixture = await createFixture({});

    const outcome = await resolveEpisode({ ...fixture.input, artifactDir: join(fixture.root, 'absent') });

    expect(expectFailure(outcome)).toBe('no-artifact-dir');
  });

  it('reports an absent pull-request artifact separately from an absent merge artifact', async () => {
    const fixture = await createFixture({ omit: 'pull-request' });

    expect(expectFailure(await resolveEpisode(fixture.input))).toBe('no-agent-lede');
  });

  it('reports a merge artifact carrying no body section', async () => {
    const fixture = await createFixture({ mergedLede: '' });

    expect(expectFailure(await resolveEpisode(fixture.input))).toBe('no-merged-lede');
  });

  it('reports an unreadable doctrine file', async () => {
    const fixture = await createFixture({});
    await rm(join(fixture.dataDir, 'lede-voice.md'));

    expect(expectFailure(await resolveEpisode(fixture.input))).toBe('no-doctrine');
  });

  it('reports a work type the taxonomy does not declare', async () => {
    const fixture = await createFixture({ type: 'invented' });

    expect(expectFailure(await resolveEpisode(fixture.input))).toBe('unresolved-identity');
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

/** One temporary fixture tree: the artifact directory, the `_data` directory, and a ready-made resolver input. */
interface Fixture {
  root: string;
  artifactDir: string;
  dataDir: string;
  input: Parameters<typeof resolveEpisode>[0];
}

/**
 * Builds a temporary ticket directory carrying a pull-request, merge, and change-summary artifact, plus a `_data`
 * directory holding a doctrine file and a minimal work-type taxonomy. The change summary declares a type and scope
 * that differ from the resolver input's, so a test can tell a flag from its fallback.
 */
async function createFixture(overrides: {
  type?: string;
  mergedLede?: string;
  omit?: 'pull-request' | 'merge';
}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'lede-decision-'));
  const artifactDir = join(root, 'tickets', '1107');
  const dataDir = join(root, '_data');
  await mkdir(artifactDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });

  if (overrides.omit !== 'pull-request') {
    const body = `## Body\n\n${section('What', AGENT_LEDE)}\n## Why\n\nThe motivation.\n`;
    await writeArtifact(artifactDir, '20260730-174300Z_fixture_pull-request.md', body);
  }
  if (overrides.omit !== 'merge') {
    await writeArtifact(
      artifactDir,
      '20260730-175638Z_fixture_merge.md',
      section('Body', overrides.mergedLede ?? MERGED_LEDE),
    );
  }
  await writeArtifact(
    artifactDir,
    '20260730-174234Z_fixture_change-summary.md',
    `---\ntype: fix\nscope: kb\nticket_id: '1107'\n---\n\n# Title\n`,
  );

  await writeFile(join(dataDir, 'lede-voice.md'), '# Lede voice\n\nDoctrine text.\n', 'utf8');
  await writeFile(
    join(dataDir, 'work-types.json'),
    JSON.stringify({
      types: [
        { key: 'feat', tier: 'public', aliases: ['feature'] },
        { key: 'fix', tier: 'public', aliases: [] },
      ],
    }),
    'utf8',
  );

  return {
    root,
    artifactDir,
    dataDir,
    input: {
      artifactDir,
      dataDir,
      pr: '1124',
      mergeCommit: '35aa58d7',
      type: overrides.type ?? 'feat',
      scope: 'agents',
      manifestPath: join(root, 'manifest.json'),
    },
  };
}

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

/** Renders a second-level Markdown section with its heading. */
function section(heading: string, body: string): string {
  return `## ${heading}\n\n${body}\n`;
}

/** Writes one artifact file into a directory. */
async function writeArtifact(directory: string, filename: string, content: string): Promise<void> {
  await writeFile(join(directory, filename), content, 'utf8');
}

// endregion | Helpers
