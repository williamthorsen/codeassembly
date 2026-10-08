import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CANONICAL_TAXONOMY } from '@williamthorsen/change-grammar';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildWorkTypesDocument,
  checkWorkTypesFile,
  serializeWorkTypesDocument,
} from '../build-work-types-document.ts';

describe(buildWorkTypesDocument, () => {
  it('drops every trackerLabel', () => {
    const document = buildWorkTypesDocument();

    expect(document.types.some((entry) => 'trackerLabel' in entry)).toBe(false);
  });

  it('keeps every other field of the taxonomy, in its key order', () => {
    const document = buildWorkTypesDocument();

    expect(Object.keys(document)).toStrictEqual(Object.keys(CANONICAL_TAXONOMY));
    expect(document.version).toBe(CANONICAL_TAXONOMY.version);
    expect(document.types.map((entry) => Object.keys(entry))).toStrictEqual(
      CANONICAL_TAXONOMY.types.map((entry) => Object.keys(entry).filter((key) => key !== 'trackerLabel')),
    );
    expect(document.types.map((entry) => entry.key)).toStrictEqual(CANONICAL_TAXONOMY.types.map((entry) => entry.key));
  });
});

describe(checkWorkTypesFile, () => {
  let scratch: string;
  let filePath: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'work-types-document-'));
    filePath = path.join(scratch, 'work-types.json');
  });

  afterEach(async () => {
    await rm(scratch, { force: true, recursive: true });
  });

  it('reports a file that matches the serialized document as current', async () => {
    await writeFile(filePath, serializeWorkTypesDocument(buildWorkTypesDocument()), 'utf8');

    expect(await checkWorkTypesFile(filePath)).toBe('current');
  });

  it('reports a file that differs as stale', async () => {
    await writeFile(filePath, JSON.stringify(buildWorkTypesDocument()), 'utf8');

    expect(await checkWorkTypesFile(filePath)).toBe('stale');
  });

  it('reports an absent file as missing', async () => {
    expect(await checkWorkTypesFile(filePath)).toBe('missing');
  });
});
