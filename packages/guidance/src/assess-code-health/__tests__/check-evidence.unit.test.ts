import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkEvidence, extractSection } from '../check-evidence.ts';
import { runCli } from '../cli.ts';
import { type Evidence, type Proposal, ProposalsSchema, type SenseDocument } from '../schemas.ts';
import { realSenseDependencies } from '../sense.ts';

const SENSE: SenseDocument = {
  unit: 'src',
  windowDays: 180,
  windowStart: null,
  commit: 'a'.repeat(40),
  sensors: [
    { name: 'hotspots', version: null, status: 'ok', detail: null, outputPath: null, data: [] },
    { name: 'coverage', version: null, status: 'not-applicable', detail: 'none', outputPath: null, data: null },
  ],
};

describe('checkEvidence', () => {
  let root: string;

  beforeEach(async () => {
    root = realpathSync(await mkdtemp(path.join(tmpdir(), 'code-health-evidence-')));
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'a.ts'), 'export function run() {\n  return   doWork();\n}\n');
    writeFileSync(
      path.join(root, 'rules.md'),
      '# Rules\n\n## Errors\n\nNever swallow an\nerror silently.\n\n### Detail\n\nNested text.\n\n## Other\n\nOutside.\n',
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('passes a proposal whose evidence all resolves, collapsing whitespace in quotes', () => {
    const proposal = buildProposal([
      { kind: 'span', path: 'src/a.ts', startLine: 1, endLine: 2, quote: 'return doWork();' },
      { kind: 'rule', rulebook: 'rules.md', section: 'Errors', quote: 'Never swallow an error silently.' },
      { kind: 'rule', rulebook: 'rules.md', section: 'Errors', quote: 'Nested text.' },
      { kind: 'sensor', sensor: 'hotspots', detail: 'rank 1' },
    ]);

    expect(checkEvidence([proposal], SENSE, root)).toEqual({ passed: ['S1'], failed: [] });
  });

  it.each<[string, Evidence | undefined, string[] | undefined, RegExp]>([
    ['a missing path', undefined, ['src/gone.ts'], /path src\/gone\.ts does not exist/],
    [
      'a span past the end',
      { kind: 'span', path: 'src/a.ts', startLine: 2, endLine: 9, quote: 'x' },
      undefined,
      /outside/,
    ],
    [
      'a quote outside the span',
      { kind: 'span', path: 'src/a.ts', startLine: 1, endLine: 1, quote: 'doWork' },
      undefined,
      /quote is not in/,
    ],
    [
      'a missing rulebook',
      { kind: 'rule', rulebook: 'none.md', section: 'Errors', quote: 'x' },
      undefined,
      /does not exist/,
    ],
    [
      'a missing section',
      { kind: 'rule', rulebook: 'rules.md', section: 'errors', quote: 'x' },
      undefined,
      /does not have the section/,
    ],
    [
      'a quote from another section',
      { kind: 'rule', rulebook: 'rules.md', section: 'Errors', quote: 'Outside.' },
      undefined,
      /quote is not in section/,
    ],
    ['a sensor that did not run', { kind: 'sensor', sensor: 'coverage', detail: 'low' }, undefined, /did not run/],
  ])('fails a proposal with %s', (_label, evidence, paths, reason) => {
    const proposal = buildProposal(evidence === undefined ? undefined : [evidence], paths);

    const report = checkEvidence([proposal], SENSE, root);

    expect(report.passed).toEqual([]);
    expect(report.failed[0]?.reason).toMatch(reason);
  });

  it('reports invalid-proposals through the CLI for a proposal that has a grade', () => {
    const proposalsPath = path.join(root, 'proposals.json');
    const sensePath = path.join(root, 'sense.json');
    writeFileSync(proposalsPath, JSON.stringify([{ ...buildProposal(), confidence: 'high' }]));
    writeFileSync(sensePath, JSON.stringify(SENSE));

    const result = runCli(['check-evidence', '--proposals', proposalsPath, '--sense', sensePath, '--root', root], {
      root,
      sense: realSenseDependencies,
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid-proposals' });
  });
});

describe('ProposalsSchema', () => {
  it.each(['confidence', 'value'])('rejects a proposal with a %s field', (field) => {
    expect(ProposalsSchema.safeParse([{ ...buildProposal(), [field]: 'high' }]).success).toBe(false);
  });
});

describe('extractSection', () => {
  it('ends a section at the next heading of the same or a higher level', () => {
    const markdown = '## A\none\n### A.1\ntwo\n## B\nthree';

    expect(extractSection(markdown, 'A')).toBe('## A\none\n### A.1\ntwo');
    expect(extractSection(markdown, 'A.1')).toBe('### A.1\ntwo');
    expect(extractSection(markdown, 'C')).toBeUndefined();
  });
});

// region | Helpers

/** Builds a proposal with valid defaults, replacing its evidence and paths when given. */
function buildProposal(evidence?: Evidence[], paths?: string[]): Proposal {
  return {
    id: 'S1',
    title: 'Split run',
    key: 'src/a.ts:long-function',
    paths: paths ?? ['src/a.ts'],
    evidence: evidence ?? [{ kind: 'sensor', sensor: 'hotspots', detail: 'rank 1' }],
    change: 'Extract the work into a helper.',
    strength: 'sensor',
    size: 'small',
    reach: 1,
  };
}

// endregion | Helpers
