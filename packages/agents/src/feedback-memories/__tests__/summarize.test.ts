import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { deriveLabel, summarizeFeedbackMemories } from '../summarize.ts';

const MACHINE = 'test-host';

/** Renders a nested-schema feedback memory carrying the given description. */
function feedback(description: string): string {
  return `---\nname: feedback-example\ndescription: ${description}\nmetadata:\n  type: feedback\n---\n\nBody.\n`;
}

async function makeProjectsRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'fm-summarize-'));
}

/** Writes a feedback memory into `<root>/<store>/memory/<filename>` with the given mtime, creating the store directory. */
async function writeMemory(
  root: string,
  store: string,
  filename: string,
  mtime: Date,
  description = 'a memory',
): Promise<void> {
  const dir = join(root, store, 'memory');
  await mkdir(dir, { recursive: true });
  const path = join(dir, filename);
  await writeFile(path, feedback(description), 'utf8');
  await utimes(path, mtime, mtime);
}

describe(summarizeFeedbackMemories, () => {
  it('rolls memories up per project with counts and the newest mtime', async () => {
    const root = await makeProjectsRoot();
    await writeMemory(root, '-store-a', 'feedback-old.md', new Date('2026-06-01T00:00:00.000Z'));
    await writeMemory(root, '-store-a', 'feedback-new.md', new Date('2026-06-15T12:30:00.000Z'));
    await writeMemory(root, '-store-b', 'feedback-solo.md', new Date('2026-05-20T08:00:00.000Z'));

    const result = await summarizeFeedbackMemories({ projectsRoot: root, machine: MACHINE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.total).toBe(3);
    const byStore = Object.fromEntries(result.projects.map((project) => [project.store, project]));
    expect(byStore['-store-a']?.count).toBe(2);
    expect(byStore['-store-a']?.lastModified).toBe('2026-06-15T12:30:00.000Z');
    expect(byStore['-store-b']?.count).toBe(1);
    expect(byStore['-store-b']?.lastModified).toBe('2026-05-20T08:00:00.000Z');
  });

  it('sorts projects alphabetically by label', async () => {
    const root = await makeProjectsRoot();
    const mtime = new Date('2026-06-01T00:00:00.000Z');
    await writeMemory(root, '-zed', 'feedback-z.md', mtime);
    await writeMemory(root, '-alpha', 'feedback-a.md', mtime);
    await writeMemory(root, '-mid', 'feedback-m.md', mtime);

    const result = await summarizeFeedbackMemories({ projectsRoot: root, machine: MACHINE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.projects.map((project) => project.label)).toEqual(['-alpha', '-mid', '-zed']);
  });

  it('includes each memory slug and description for verbose rendering', async () => {
    const root = await makeProjectsRoot();
    await writeMemory(root, '-store-a', 'feedback-first.md', new Date('2026-06-01T00:00:00.000Z'), 'first description');

    const result = await summarizeFeedbackMemories({ projectsRoot: root, machine: MACHINE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.projects[0]?.memories).toEqual([{ slug: 'feedback-first', description: 'first description' }]);
  });

  it('propagates a no-such-store failure from enumeration', async () => {
    const root = await makeProjectsRoot();
    await writeMemory(root, '-store-a', 'feedback-a.md', new Date('2026-06-01T00:00:00.000Z'));

    const result = await summarizeFeedbackMemories({ projectsRoot: root, store: '-missing', machine: MACHINE });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no-such-store');
  });

  it('propagates a no-projects-root failure from enumeration', async () => {
    const result = await summarizeFeedbackMemories({
      projectsRoot: join(await makeProjectsRoot(), 'nope'),
      machine: MACHINE,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no-projects-root');
  });
});

describe(deriveLabel, () => {
  it('uses the resolved repo directory basename when a repo path is present', () => {
    expect(deriveLabel('/Users/me/repos/my-app', '-Users-me-repos-my-app')).toBe('my-app');
  });

  it('falls back to the store slug when there is no live repo', () => {
    expect(deriveLabel(null, '-store-a')).toBe('-store-a');
  });
});
