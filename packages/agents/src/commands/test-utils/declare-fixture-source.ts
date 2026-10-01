import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { isRecord } from '../../lib/type-guards.ts';

/** The source name under which a test declares its fixture content tree. */
export const FIXTURE_SOURCE_NAME = 'codeassembly';

/**
 * Writes `<baseDir>/.agents/codeassembly.yaml` declaring `contentDir` as a source named `FIXTURE_SOURCE_NAME`, merged
 * into `yaml` when given. A command run against `baseDir` then resolves the fixture tree as it would a declared
 * library.
 */
export async function declareFixtureSource(baseDir: string, contentDir: string, yaml = ''): Promise<string> {
  const declarationPath = path.join(baseDir, '.agents', 'codeassembly.yaml');
  await writeFixtureDeclaration(declarationPath, contentDir, yaml);
  return declarationPath;
}

/**
 * Writes `yaml` to `declarationPath` with a `sources:` entry naming `contentDir` added ahead of any that `yaml`
 * declares, which makes the fixture tree the file's lowest-precedence source.
 */
export async function writeFixtureDeclaration(declarationPath: string, contentDir: string, yaml = ''): Promise<void> {
  const parsed: unknown = parseYaml(yaml);
  const declaration = isRecord(parsed) ? parsed : {};
  const declared: ReadonlyArray<unknown> = Array.isArray(declaration.sources) ? declaration.sources : [];
  const sources = [{ name: FIXTURE_SOURCE_NAME, path: contentDir }, ...declared];
  await mkdir(path.dirname(declarationPath), { recursive: true });
  await writeFile(declarationPath, stringifyYaml({ ...declaration, sources }), 'utf8');
}
