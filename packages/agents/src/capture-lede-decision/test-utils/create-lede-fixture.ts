import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The lede the fixture's pull-request artifact carries. */
export const FIXTURE_AGENT_LEDE = 'Rulebooks can now address a file by linking to it.';

/** The lede the fixture's merge artifact carries, a revision of {@link FIXTURE_AGENT_LEDE}. */
export const FIXTURE_MERGED_LEDE =
  'Rulebooks can now address a file by linking to it: a Markdown link reaches each harness.';

/** A temporary fixture tree: the ticket's artifact directory, the `_data` directory, and an install-manifest path. */
export interface LedeFixture {
  /** Temporary root holding everything the fixture created. */
  root: string;
  artifactDir: string;
  dataDir: string;
  /** Path the fixture would write an install manifest to; absent unless a test writes one. */
  manifestPath: string;
}

/**
 * Builds a temporary ticket directory carrying a pull-request, merge, and change-summary artifact, plus a `_data`
 * directory holding a doctrine file and a minimal work-type taxonomy.
 *
 * The change summary declares a work type and scope that differ from what a caller would normally pass as flags, so a
 * test can tell a supplied flag from its artifact fallback.
 */
export async function createLedeFixture(
  overrides: {
    type?: string;
    mergedLede?: string;
    omit?: 'pull-request' | 'merge';
    /** Ticket id as the change summary spells it; a wholly numeric id is written unquoted, as the real artifact does. */
    ticketId?: string;
  } = {},
): Promise<LedeFixture> {
  const root = await mkdtemp(join(tmpdir(), 'lede-decision-'));
  const artifactDir = join(root, 'tickets', '1107');
  const dataDir = join(root, '_data');
  await mkdir(artifactDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });

  if (overrides.omit !== 'pull-request') {
    const body = `## Body\n\n${renderSection('What', FIXTURE_AGENT_LEDE)}\n## Why\n\nThe motivation.\n`;
    await writeArtifact(artifactDir, '20260730-174300Z_fixture_pull-request.md', body);
  }
  if (overrides.omit !== 'merge') {
    await writeArtifact(
      artifactDir,
      '20260730-175638Z_fixture_merge.md',
      renderSection('Body', overrides.mergedLede ?? FIXTURE_MERGED_LEDE),
    );
  }
  await writeArtifact(
    artifactDir,
    '20260730-174234Z_fixture_change-summary.md',
    `---\ntype: fix\nscope: kb\nticket_id: ${overrides.ticketId ?? '1107'}\n---\n\n# Title\n`,
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

  return { root, artifactDir, dataDir, manifestPath: join(root, 'manifest.json') };
}

/** Renders a second-level Markdown section with its heading. */
export function renderSection(heading: string, body: string): string {
  return `## ${heading}\n\n${body}\n`;
}

/** Writes one artifact file into a directory. */
export async function writeArtifact(directory: string, filename: string, content: string): Promise<void> {
  await writeFile(join(directory, filename), content, 'utf8');
}
