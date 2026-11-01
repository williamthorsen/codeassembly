import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCli } from '../cli.ts';
import { SenseDocumentSchema } from '../schemas.ts';
import { buildContext } from '../test-utils/build-context.ts';

describe('sense', () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = realpathSync(await mkdtemp(path.join(tmpdir(), 'code-health-sense-')));
    git('init', '--quiet', '--initial-branch=main');
    writeFileSync(path.join(scratch, '.gitattributes'), 'pkg/gen.ts linguist-generated\n');
    for (let round = 0; round < 3; round += 1) {
      writeFile('pkg/a.ts', `line\n`.repeat(round + 2));
      writeFile('pkg/b.ts', `other ${round}\n`);
      writeFile('pkg/gen.ts', `generated ${round}\n`);
      writeFile('pkg/pnpm-lock.yaml', `lock ${round}\n`);
      writeFile('outside.ts', `outside ${round}\n`);
      commit(`round ${round}`);
    }
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('writes hotspots and co-change for the unit, excluding generated files and lockfiles', async () => {
    const out = path.join(scratch, 'out', 'sense.json');

    const result = await runCli(['sense', '--unit', 'pkg', '--out', out, '--window', '30'], buildContext(scratch));

    expect(result).toMatchObject({ ok: true });
    const document = SenseDocumentSchema.parse(JSON.parse(readFileSync(out, 'utf8')));
    expect(findSensor(document, 'hotspots').data).toEqual([
      { path: 'pkg/a.ts', commits: 3, lines: 4, score: 12, rank: 1 },
      { path: 'pkg/b.ts', commits: 3, lines: 1, score: 3, rank: 2 },
    ]);
    expect(findSensor(document, 'co-change').data).toEqual([{ a: 'pkg/a.ts', b: 'pkg/b.ts', commits: 3 }]);
    expect(findSensor(document, 'coverage').status).toBe('not-applicable');
    expect(document.windowStart).not.toBeNull();
  });

  it('records a check exit code as evidence and a missing command as a failed sensor', async () => {
    const out = path.join(scratch, 'out', 'sense.json');

    await runCli(
      [
        'sense',
        '--unit',
        'pkg',
        '--out',
        out,
        '--check',
        'lint=echo found; exit 3',
        '--check',
        'gone=no-such-tool-xyz',
      ],
      buildContext(scratch),
    );

    const document = SenseDocumentSchema.parse(JSON.parse(readFileSync(out, 'utf8')));
    expect(findSensor(document, 'lint')).toMatchObject({ status: 'ok', data: { exitCode: 3 } });
    expect(readFileSync(path.join(scratch, 'out', 'lint.log'), 'utf8')).toBe('found\n');
    expect(findSensor(document, 'gone').status).toBe('failed');
  });

  /** Runs git in the scratch repository with a fixed author. */
  function git(...args: string[]): void {
    execFileSync('git', ['-C', scratch, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', ...args]);
  }

  /** Stages everything and commits it. */
  function commit(message: string): void {
    git('add', '--all');
    git('commit', '--quiet', '--message', message);
  }

  /** Writes a file under the scratch repository, creating its directory. */
  function writeFile(relative: string, content: string): void {
    mkdirSync(path.dirname(path.join(scratch, relative)), { recursive: true });
    writeFileSync(path.join(scratch, relative), content);
  }
});

// region | Helpers

/** Returns the named sensor, failing the test when the document does not have it. */
function findSensor(document: { sensors: Array<{ name: string; status: string; data: unknown }> }, name: string) {
  const sensor = document.sensors.find((candidate) => candidate.name === name);
  if (sensor === undefined) throw new Error(`sensor ${name} is missing`);
  return sensor;
}

// endregion | Helpers
