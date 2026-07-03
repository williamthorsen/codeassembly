import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { enumerateFeedbackMemories } from '../enumerate.ts';

const MACHINE = 'test-host';

/** A feedback memory in the current nested schema, carrying `metadata.type` and `metadata.originSessionId`. */
const NESTED_FEEDBACK = `---
name: feedback-nested-example
description: "A nested-schema feedback memory"
metadata:
  node_type: memory
  type: feedback
  originSessionId: sess-nested
---

Nested schema body.
`;

/** A feedback memory in the legacy schema: a top-level \`type\` and a top-level \`originSessionId\`. */
const LEGACY_FEEDBACK = `---
name: Run nmr from monorepo root
description: legacy top-level schema
type: feedback
originSessionId: sess-legacy
---

Legacy schema body.
`;

/** A legacy feedback memory with no session id, matching the devtools-afg store shape. */
const LEGACY_NO_SESSION = `---
name: Atlaskit xcss requires static literals
description: no session id present
type: feedback
---

Body without a session id.
`;

/** A non-feedback memory (nested \`user\` type) that enumeration must skip. */
const USER_MEMORY = `---
name: user-preference
description: not feedback
metadata:
  type: user
---

A user memory.
`;

/** A feedback memory whose frontmatter fence wraps invalid YAML: a quoted scalar followed by bare text. */
const MALFORMED_FEEDBACK = `---
name: "Implement directly" means no skill wrapper
description: malformed frontmatter
type: feedback
---

Body of a malformed memory.
`;

async function makeProjectsRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'migrate-enum-'));
}

/** Writes a memory file into `<root>/<store>/memory/<filename>`, creating the store's memory directory. */
async function writeMemory(root: string, store: string, filename: string, content: string): Promise<void> {
  const dir = join(root, store, 'memory');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), content, 'utf8');
}

describe(enumerateFeedbackMemories, () => {
  it('enumerates both frontmatter schemas and both filename conventions', async () => {
    const root = await makeProjectsRoot();
    await writeMemory(root, '-store-a', 'feedback-nested-example.md', NESTED_FEEDBACK);
    await writeMemory(root, '-store-a', 'run-nmr-from-root.md', LEGACY_FEEDBACK);

    const result = await enumerateFeedbackMemories({ projectsRoot: root, machine: MACHINE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.memories.map((memory) => memory.slug)).toEqual(['feedback-nested-example', 'run-nmr-from-root']);
    expect(result.memories.every((memory) => memory.store === '-store-a')).toBe(true);
    expect(result.memories.every((memory) => memory.machine === MACHINE)).toBe(true);
  });

  it('reads name, description, body, and index path for a discovered memory', async () => {
    const root = await makeProjectsRoot();
    await writeMemory(root, '-store-a', 'feedback-nested-example.md', NESTED_FEEDBACK);

    const result = await enumerateFeedbackMemories({ projectsRoot: root, machine: MACHINE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [memory] = result.memories;
    expect(memory?.name).toBe('feedback-nested-example');
    expect(memory?.description).toBe('A nested-schema feedback memory');
    expect(memory?.body).toContain('Nested schema body.');
    expect(memory?.memoryIndexPath).toBe(join(root, '-store-a', 'memory', 'MEMORY.md'));
  });

  it('extracts originSessionId from either schema and leaves it null when absent', async () => {
    const root = await makeProjectsRoot();
    await writeMemory(root, '-store-a', 'feedback-nested-example.md', NESTED_FEEDBACK);
    await writeMemory(root, '-store-a', 'run-nmr-from-root.md', LEGACY_FEEDBACK);
    await writeMemory(root, '-store-b', 'atlaskit-xcss.md', LEGACY_NO_SESSION);

    const result = await enumerateFeedbackMemories({ projectsRoot: root, machine: MACHINE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sessions = Object.fromEntries(result.memories.map((memory) => [memory.slug, memory.originSessionId]));
    expect(sessions['feedback-nested-example']).toBe('sess-nested');
    expect(sessions['run-nmr-from-root']).toBe('sess-legacy');
    expect(sessions['atlaskit-xcss']).toBeNull();
  });

  it('excludes non-feedback memories and the MEMORY.md index', async () => {
    const root = await makeProjectsRoot();
    await writeMemory(root, '-store-a', 'feedback-nested-example.md', NESTED_FEEDBACK);
    await writeMemory(root, '-store-a', 'user-preference.md', USER_MEMORY);
    await writeMemory(root, '-store-a', 'MEMORY.md', '# Memory\n\n## Feedback\n\n- [x](feedback-nested-example.md)\n');

    const result = await enumerateFeedbackMemories({ projectsRoot: root, machine: MACHINE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.memories.map((memory) => memory.slug)).toEqual(['feedback-nested-example']);
  });

  it('reports a malformed memory (bad YAML in a real fence) in skipped rather than dropping it', async () => {
    const root = await makeProjectsRoot();
    await writeMemory(root, '-store-a', 'feedback-nested-example.md', NESTED_FEEDBACK);
    await writeMemory(root, '-store-a', 'feedback-malformed.md', MALFORMED_FEEDBACK);

    const result = await enumerateFeedbackMemories({ projectsRoot: root, machine: MACHINE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.memories.map((memory) => memory.slug)).toEqual(['feedback-nested-example']);
    expect(result.skipped.map((entry) => entry.path)).toEqual([
      join(root, '-store-a', 'memory', 'feedback-malformed.md'),
    ]);
  });

  it('omits a fence-less file from both memories and skipped, since a feedback memory always has frontmatter', async () => {
    const root = await makeProjectsRoot();
    await writeMemory(root, '-store-a', 'feedback-nested-example.md', NESTED_FEEDBACK);
    await writeMemory(root, '-store-a', 'interaction-style.md', '# Interaction style\n\nProse with no frontmatter.\n');

    const result = await enumerateFeedbackMemories({ projectsRoot: root, machine: MACHINE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.memories.map((memory) => memory.slug)).toEqual(['feedback-nested-example']);
    expect(result.skipped).toEqual([]);
  });

  it('skips a store with no memory directory and returns an empty list when nothing matches', async () => {
    const root = await makeProjectsRoot();
    await mkdir(join(root, '-store-empty'), { recursive: true });
    await writeMemory(root, '-store-b', 'user-preference.md', USER_MEMORY);

    const result = await enumerateFeedbackMemories({ projectsRoot: root, machine: MACHINE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.memories).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('orders memories by store then slug for stable output', async () => {
    const root = await makeProjectsRoot();
    await writeMemory(root, '-store-b', 'zebra.md', LEGACY_NO_SESSION);
    await writeMemory(root, '-store-a', 'run-nmr-from-root.md', LEGACY_FEEDBACK);
    await writeMemory(root, '-store-a', 'feedback-nested-example.md', NESTED_FEEDBACK);

    const result = await enumerateFeedbackMemories({ projectsRoot: root, machine: MACHINE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.memories.map((memory) => `${memory.store}/${memory.slug}`)).toEqual([
      '-store-a/feedback-nested-example',
      '-store-a/run-nmr-from-root',
      '-store-b/zebra',
    ]);
  });

  it('scopes enumeration to a single store when store is set', async () => {
    const root = await makeProjectsRoot();
    await writeMemory(root, '-store-a', 'feedback-nested-example.md', NESTED_FEEDBACK);
    await writeMemory(root, '-store-b', 'atlaskit-xcss.md', LEGACY_NO_SESSION);

    const result = await enumerateFeedbackMemories({ projectsRoot: root, store: '-store-b', machine: MACHINE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.memories.map((memory) => memory.store)).toEqual(['-store-b']);
  });

  it('fails with no-such-store when store names no directory under the root', async () => {
    const root = await makeProjectsRoot();
    await writeMemory(root, '-store-a', 'feedback-nested-example.md', NESTED_FEEDBACK);

    const result = await enumerateFeedbackMemories({ projectsRoot: root, store: '-store-missing', machine: MACHINE });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no-such-store');
  });

  it('fails with no-projects-root when the projects root is absent', async () => {
    const root = join(await makeProjectsRoot(), 'does-not-exist');

    const result = await enumerateFeedbackMemories({ projectsRoot: root, machine: MACHINE });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no-projects-root');
  });
});
