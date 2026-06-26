import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveContentDir } from '../content-resolver.ts';
import { resolveClosure } from '../dependency-resolver.ts';
import { readDeploy } from '../deploy-frontmatter.ts';

describe('capture-feedback delivery', () => {
  it('ships capture-feedback as a declared skill in the recommended closure', async () => {
    const contentDir = resolveContentDir();

    const closure = await resolveClosure({ collection: ['recommended'] }, contentDir);
    expect(closure.skills).toContain('capture-feedback');

    const skillMd = await readFile(path.join(contentDir, 'skills', 'capture-feedback', 'SKILL.md'), 'utf8');
    expect(readDeploy(skillMd)).toBe('declared');
  });
});
