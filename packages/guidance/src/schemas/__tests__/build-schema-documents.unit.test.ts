import { describe, expect, it } from 'vitest';

import { buildSchemaDocuments, buildSchemaUrl, SCHEMA_FILE_NAMES } from '../build-schema-documents.ts';

describe(buildSchemaDocuments, () => {
  it('builds one document per published schema', () => {
    const fileNames = buildSchemaDocuments('1.2.3').map((schema) => schema.fileName);

    expect(fileNames).toEqual([...SCHEMA_FILE_NAMES]);
  });

  it('stamps each document with the $id of the release at the given version', () => {
    for (const { fileName, document } of buildSchemaDocuments('1.2.3')) {
      expect(document.$id).toBe(`https://unpkg.com/codeassembly-guidance@1.2.3/schemas/${fileName}`);
    }
  });

  it('places $schema first and $id second, ahead of the source content', () => {
    for (const { document } of buildSchemaDocuments('1.2.3')) {
      expect(Object.keys(document).slice(0, 3)).toEqual(['$schema', '$id', expect.any(String)]);
      expect(document.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    }
  });
});

describe(buildSchemaUrl, () => {
  it('names the package version and the versioned file name', () => {
    expect(buildSchemaUrl('preferences.v1.json', '0.4.0')).toBe(
      'https://unpkg.com/codeassembly-guidance@0.4.0/schemas/preferences.v1.json',
    );
  });
});
