import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { CLASSES } from '../../src/groom-backlog/classify.ts';
import { extractSection } from '../../src/lib/markdown-sections.ts';

const SKILL = new URL('../skills/groom-backlog/SKILL.md', import.meta.url).pathname;

// The skill states the policy and the helper applies it, so the skill's table and the helper's classes must name the
// same classes in the same order, which is the order in which the helper tests them.
describe('the groom-backlog decision policy', () => {
  it("states one row per helper class, in the helper's order", async () => {
    const section = extractSection({ text: await readFile(SKILL, 'utf8'), heading: 'Decision policy' }) ?? '';
    const classes = section
      .matchAll(/^\| `([a-z-]+)` +\|/gm)
      .map((match) => match[1])
      .toArray();

    expect(classes).toStrictEqual([...CLASSES]);
  });
});
