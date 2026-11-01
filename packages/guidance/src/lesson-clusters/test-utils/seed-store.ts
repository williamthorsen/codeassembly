import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The frontmatter of a fixture event; any field left out takes a fixed default. */
export interface SeedEvent {
  id: string;
  capturedAt?: string;
  summary?: string;
  tags?: string[];
  addressedBy?: string[];
  impact?: string;
  skill?: string;
  repo?: string;
  body?: string;
}

/** Creates a temp store and an isolated home whose `kb.yaml` registers it under `name` and as `feedback_kb`. */
export async function makeStore(name = 'fixture'): Promise<{ storePath: string; home: string }> {
  const storePath = await mkdtemp(join(tmpdir(), 'lesson-clusters-store-'));
  await mkdir(join(storePath, '.kb'), { recursive: true });
  const home = await mkdtemp(join(tmpdir(), 'lesson-clusters-home-'));
  await mkdir(join(home, '.agents'), { recursive: true });
  await writeFile(
    join(home, '.agents', 'kb.yaml'),
    `feedback_kb: ${name}\nkbs:\n  ${name}:\n    path: ${storePath}\n`,
    'utf8',
  );
  return { storePath, home };
}

/** Writes each event to `content/events/{id}.md` in the store. */
export async function seedEvents(storePath: string, events: readonly SeedEvent[]): Promise<void> {
  const dir = join(storePath, 'content', 'events');
  await mkdir(dir, { recursive: true });
  for (const event of events) {
    const front = [
      'recordType: event',
      `id: ${event.id}`,
      `captured-at: ${event.capturedAt ?? '2026-06-18T09:41:02Z'}`,
      'cwd: /tmp/work',
      `summary: ${JSON.stringify(event.summary ?? `Summary of ${event.id}`)}`,
      `tags: ${JSON.stringify(event.tags ?? ['feedback'])}`,
      ...(event.addressedBy === undefined ? [] : [`addressed-by: ${JSON.stringify(event.addressedBy)}`]),
      ...(event.impact === undefined ? [] : [`impact: ${event.impact}`]),
      ...(event.skill === undefined ? [] : [`skill: ${event.skill}`]),
      ...(event.repo === undefined ? [] : [`repo: ${event.repo}`]),
    ];
    await writeFile(join(dir, `${event.id}.md`), `---\n${front.join('\n')}\n---\n\n${event.body ?? 'Body.'}\n`, 'utf8');
  }
}
