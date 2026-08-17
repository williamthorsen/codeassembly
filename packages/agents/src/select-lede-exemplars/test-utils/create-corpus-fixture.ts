import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The work types the fixture taxonomy declares, spanning all three tiers so widening has somewhere to go. */
export const FIXTURE_WORK_TYPES = [
  { key: 'feat', tier: 'public', aliases: ['feature'] },
  { key: 'fix', tier: 'public', aliases: [] },
  { key: 'refactor', tier: 'internal', aliases: [] },
  { key: 'ci', tier: 'process', aliases: [] },
  { key: 'docs', tier: 'process', aliases: [] },
];

/** One decision record to plant in a fixture corpus. */
export interface DecisionSpec {
  /** Filename stem, which the scan reads as a ULID and orders by. */
  id: string;
  /** Work type as the record's frontmatter spells it, whether a canonical key or a declared alias. */
  type: string;
  capturedAt: string;
  /** Merged lede, written to the section a revised decision carries; absent leaves the record with the agent lede alone. */
  mergedLede?: string;
  scope?: string;
  pr?: string;
  /** Tier as the record recorded it; defaults to the tier the fixture taxonomy declares for `type`. */
  tier?: string;
  tags?: readonly string[];
}

/** A temporary corpus: an event store holding the planted records, and a `_data` directory holding the taxonomy. */
export interface CorpusFixture {
  storePath: string;
  dataDir: string;
}

/** The agent lede a planted record carries, distinct per record so a test can tell which was selected. */
export function agentLedeFor(id: string): string {
  return `Agent lede of ${id}.`;
}

/**
 * Stands up a temporary event store holding one record per decision spec, plus a `_data` directory carrying the
 * fixture taxonomy. `files` plants raw content under `content/events/`, for a record whose own shape is the subject
 * of the test.
 */
export async function createCorpusFixture(
  input: { decisions?: readonly DecisionSpec[]; files?: Readonly<Record<string, string>> } = {},
): Promise<CorpusFixture> {
  const storePath = await mkdtemp(join(tmpdir(), 'lede-corpus-'));
  const eventsDir = join(storePath, 'content', 'events');
  await mkdir(join(storePath, '.kb'), { recursive: true });
  await mkdir(eventsDir, { recursive: true });

  const decisions = input.decisions ?? [];
  for (const decision of decisions) {
    await writeFile(join(eventsDir, `${decision.id}.md`), renderDecision(decision), 'utf8');
  }
  const files = Object.entries(input.files ?? {});
  for (const [filename, content] of files) {
    await writeFile(join(eventsDir, filename), content, 'utf8');
  }

  const dataDir = join(storePath, '_data');
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'work-types.json'), JSON.stringify({ types: FIXTURE_WORK_TYPES }), 'utf8');

  return { storePath, dataDir };
}

/** Renders a decision record in the shape `capture-lede-decision` writes. */
export function renderDecision(spec: DecisionSpec): string {
  const tier = spec.tier ?? FIXTURE_WORK_TYPES.find((entry) => entry.key === spec.type)?.tier ?? 'public';
  const tags = spec.tags ?? [
    'lede-decision',
    `type:${spec.type}`,
    spec.mergedLede === undefined ? 'accepted' : 'revised',
  ];
  const sections = [`## Agent lede\n\n${agentLedeFor(spec.id)}`];
  if (spec.mergedLede !== undefined) {
    sections.push(`## Merged lede\n\n${spec.mergedLede}`);
  }

  return [
    '---',
    'recordType: event',
    `id: ${spec.id}`,
    `captured-at: ${spec.capturedAt}`,
    'cwd: /repo',
    `summary: 'Lede decision for ${spec.id}'`,
    `tags: [${tags.join(', ')}]`,
    `type: ${spec.type}`,
    `tier: ${tier}`,
    `scope: ${spec.scope ?? 'agents'}`,
    `pr: '${spec.pr ?? '1'}'`,
    '---',
    '',
    `${sections.join('\n\n')}\n`,
  ].join('\n');
}
