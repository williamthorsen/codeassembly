import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderChangeRecordBlock } from '../change-record-block.ts';
import { runDescribe } from '../cli.ts';
import { parseArgs } from '../parse-args.ts';
import {
  DATA_DIR,
  DEFECTIVE_TEMPLATES,
  HOUSE_TEMPLATES,
  LABEL_MAP,
  makeRepo,
  writeBody,
  writeLabelMap,
} from '../test-utils/cli-fixtures.ts';

describe('resolve-labels', () => {
  it('reads the body file and the record flags', () => {
    expect(
      parseArgs(['resolve-labels', '--body-file', 'summary.md', '--scope', 'agents', '--type', 'feat', '--breaking']),
    ).toEqual({
      bodyFile: 'summary.md',
      record: { breaking: true, scope: 'agents', type: 'feat' },
      subcommand: 'resolve-labels',
    });
  });

  it('reads the record flags alone when --body-file is absent', () => {
    expect(parseArgs(['resolve-labels', '--scope', 'agents', '--type', 'feat'])).toEqual({
      record: { scope: 'agents', type: 'feat' },
      subcommand: 'resolve-labels',
    });
  });

  it('if --body-file is blank, refuses the invocation', () => {
    expect(() => parseArgs(['resolve-labels', '--body-file', ' '])).toThrow('--body-file requires a value');
  });

  it('refuses --title, which resolve-labels does not take', () => {
    expect(() => parseArgs(['resolve-labels', '--body-file', 'summary.md', '--title', 'Add foo'])).toThrow(
      'unknown flag: --title',
    );
  });

  it('labels the entries in the body’s last change-record block together with the record', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    await writeLabelMap(cwd, LABEL_MAP);
    const block = renderChangeRecordBlock({
      entries: [
        { breaking: false, scopes: ['agents'], text: 'Adds the parser', type: 'feat' },
        { breaking: true, scopes: ['kb', 'agents'], text: 'Renames the store', type: 'drop' },
      ],
      title: 'Add the parser',
    });
    const bodyFile = await writeBody(`---\ntitle: Add the parser\n---\n\n## What\n\nAdds the parser.\n\n${block}\n`);

    const argv = ['resolve-labels', '--body-file', bodyFile, '--type', 'feat!', '--scope', '*'];
    const { output, warnings } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ labels: ['feature', 'removal', 'breaking', 'scope:agents', 'scope:kb'] });
    expect(warnings).toStrictEqual([]);
  });

  it('labels the record alone when the body does not contain a block, as the effective record labels it', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    await writeLabelMap(cwd, LABEL_MAP);
    const bodyFile = await writeBody('## What\n\nAdds the parser.\n');

    const argv = ['resolve-labels', '--body-file', bodyFile, '--scope', 'agents', '--type', 'fix', '--breaking'];
    const { output } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ labels: ['fix', 'breaking', 'scope:agents'] });
  });

  it('warns once for each type and scope that the label map does not define, and labels the rest', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    await writeLabelMap(cwd, LABEL_MAP);
    const mapPath = join(cwd, '.meta', 'label-map.json');

    const argv = ['resolve-labels', '--scope', 'guidance', '--type', 'docs!'];
    const { output, warnings } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ labels: ['breaking'] });
    expect(warnings).toStrictEqual([
      `label map ${mapPath} does not define type "docs"; leaving it unlabeled`,
      `label map ${mapPath} does not define scope "guidance"; leaving it unlabeled`,
    ]);
  });

  it('does not warn about an undefined key when the repository does not configure a label map', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

    const argv = ['resolve-labels', '--scope', 'guidance', '--type', 'feat'];
    const { output, warnings } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ labels: [] });
    expect(warnings).toStrictEqual([]);
  });

  it('warns and labels the record alone when the block is malformed', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    await writeLabelMap(cwd, LABEL_MAP);
    const bodyFile = await writeBody('## What\n\n```change-record\nentries: []\n```\n');

    const argv = ['resolve-labels', '--body-file', bodyFile, '--type', 'feat'];
    const { output, warnings } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ labels: ['feature'] });
    expect(warnings).toStrictEqual([
      'the body’s change-record block is malformed, so the entries do not add any label: `title` is missing',
    ]);
  });

  it('warns and labels the record alone when the block’s entries are malformed', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    await writeLabelMap(cwd, LABEL_MAP);
    const bodyFile = await writeBody('```change-record\ntitle: Add foo\nentries: nope\n```\n');

    const argv = ['resolve-labels', '--body-file', bodyFile, '--type', 'feat'];
    const { output, warnings } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ labels: ['feature'] });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^the body’s change entries are malformed, so the entries do not add any label: /);
  });

  it.each([
    { argv: ['--type', 'feat'], labels: ['feature'] },
    { argv: ['--type', 'fix', '--breaking'], labels: ['fix', 'breaking'] },
    { argv: ['--type', 'feat!'], labels: ['feature', 'breaking'] },
    { argv: ['--scope', 'kb', '--type', 'feat'], labels: ['feature', 'scope:kb'] },
    { argv: ['--scope', '*', '--type', 'feat'], labels: ['feature'] },
  ])('without a body file, labels the record alone: $argv', async ({ argv, labels }) => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    await writeLabelMap(cwd, LABEL_MAP);

    const { output, warnings } = await runDescribe({
      argv: ['resolve-labels', ...argv],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toStrictEqual({ labels });
    expect(warnings).toStrictEqual([]);
  });

  it('without a body file, yields an empty label list when the repository does not configure a label map', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

    const argv = ['resolve-labels', '--scope', 'agents', '--type', 'feat', '--breaking'];
    const { output } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ labels: [] });
  });

  it('yields an empty label list when the repository does not configure a label map', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const bodyFile = await writeBody('## What\n');

    const argv = ['resolve-labels', '--body-file', bodyFile, '--type', 'feat', '--breaking'];
    const { output } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({ labels: [] });
  });

  it('refuses a body file that cannot be read', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);

    await expect(
      runDescribe({
        argv: ['resolve-labels', '--body-file', join(cwd, 'absent.md')],
        cwd,
        git,
        dataDir: DATA_DIR,
        home,
      }),
    ).rejects.toThrow(/--body-file .*absent\.md cannot be read/);
  });
});

describe('resolve-effective-record', () => {
  it('reads the record flags and every override flag', () => {
    const parsed = parseArgs([
      'resolve-effective-record',
      '--title',
      'Add the parser',
      '--scope',
      'agents',
      '--type',
      'feat',
      '--breaking',
      '--override-scope',
      'kb',
      '--override-type',
      'sec',
      '--override-breaking',
    ]);

    expect(parsed).toEqual({
      overrides: { breaking: true, scope: 'kb', type: 'sec' },
      record: { breaking: true, scope: 'agents', title: 'Add the parser', type: 'feat' },
      subcommand: 'resolve-effective-record',
    });
  });

  it('reads an invocation without flags', () => {
    expect(parseArgs(['resolve-effective-record'])).toEqual({
      overrides: {},
      record: {},
      subcommand: 'resolve-effective-record',
    });
  });

  it('does not set an override for an override flag whose value is blank', () => {
    expect(parseArgs(['resolve-effective-record', '--override-scope', ' ', '--override-type', ''])).toEqual({
      overrides: {},
      record: {},
      subcommand: 'resolve-effective-record',
    });
  });

  it.each(['--ticket-ref', '--pr-number', '--no-override-breaking', '--override-title', '--base'])(
    'if %s is passed, refuses it as unknown',
    (flag) => {
      expect(() => parseArgs(['resolve-effective-record', flag, 'value'])).toThrow(`unknown flag: ${flag}`);
    },
  );

  it('rejects a stray positional', () => {
    expect(() => parseArgs(['resolve-effective-record', 'feat'])).toThrow('unexpected argument: feat');
  });

  it('if the type override spells the marker, refuses it', () => {
    expect(() => parseArgs(['resolve-effective-record', '--override-type', 'feat!'])).toThrow(
      '--override-type takes a bare type; pass --override-breaking for a breaking change',
    );
  });

  it('applies the overrides and reports every field of the effective record', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const argv = [
      'resolve-effective-record',
      '--title',
      'Add the parser',
      '--scope',
      'agents',
      '--type',
      'feat',
      '--override-type',
      'sec',
      '--override-breaking',
    ];

    const { output, warnings } = await runDescribe({ argv, cwd, git, dataDir: DATA_DIR, home });

    expect(output).toStrictEqual({
      effective_record: {
        title: 'Add the parser',
        scope: 'agents',
        type: 'sec',
        breaking: true,
        ticket_ref: null,
        pr_number: null,
      },
      defects: [],
    });
    expect(warnings).toStrictEqual([]);
  });

  it('keeps a marker spelled on the type when only the type is overridden, and clears the scope for *', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const argv = ['resolve-effective-record', '--scope', 'agents', '--type', 'feat!', '--override-scope', '*'];

    const { output } = await runDescribe({
      argv: [...argv, '--override-type', 'sec'],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ effective_record: { breaking: true, scope: null, title: null, type: 'sec' } });
  });

  it.each([
    { argv: ['--scope', 'agents'], defects: [{ kind: 'missing-type' }], name: 'does not name a type' },
    {
      argv: ['--type', 'feature'],
      defects: [{ kind: 'undeclared-type', type: 'feature' }],
      name: 'names an undeclared type',
    },
    {
      argv: ['--type', 'refactor', '--override-breaking'],
      defects: [{ kind: 'policy-violation', policy: 'forbidden', type: 'refactor' }],
      name: 'sets a marker that its type forbids',
    },
  ])('reports the defect of an effective record that $name', async ({ argv, defects }) => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const { output } = await runDescribe({
      argv: ['resolve-effective-record', ...argv],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ defects });
  });

  it('succeeds when a configured title template is defective', async () => {
    const { cwd, git, home } = await makeRepo(DEFECTIVE_TEMPLATES);

    const { output } = await runDescribe({
      argv: ['resolve-effective-record', '--type', 'feat'],
      cwd,
      git,
      dataDir: DATA_DIR,
      home,
    });

    expect(output).toMatchObject({ defects: [], effective_record: { type: 'feat' } });
  });

  it('refuses when the data directory does not contain a readable taxonomy', async () => {
    const { cwd, git, home } = await makeRepo(HOUSE_TEMPLATES);
    const dataDir = await mkdtemp(join(tmpdir(), 'describe-change-data-'));

    await expect(
      runDescribe({
        argv: ['resolve-effective-record', '--type', 'feat'],
        cwd,
        git,
        dataDir,
        home,
      }),
    ).rejects.toThrow(/resolve-effective-record checks types against the taxonomy; none is readable/);
  });
});
