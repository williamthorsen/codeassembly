import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

import { isRecord } from './is-record.ts';

/** One helper that the content manifest declares, as the manifest writes it. */
export interface HelperTarget {
  /** The entry module, relative to the manifest's directory. */
  readonly entry: string;
  /** The bundle's path relative to the content root. */
  readonly out: string;
}

/** Reads the `helpers:` list of the `codeassembly-content.yaml` at the top of `contentRoot`. */
export async function readHelperTargets(contentRoot: string): Promise<ReadonlyArray<HelperTarget>> {
  const parsed: unknown = parseYaml(await readFile(path.join(contentRoot, 'codeassembly-content.yaml'), 'utf8'));
  const helpers = isRecord(parsed) ? parsed.helpers : undefined;
  if (!Array.isArray(helpers)) {
    throw new TypeError(`${contentRoot}/codeassembly-content.yaml does not declare a helpers list`);
  }
  return helpers.map((helper: unknown) => {
    if (!isRecord(helper) || typeof helper.entry !== 'string' || typeof helper.out !== 'string') {
      throw new Error(`Malformed helper entry: ${JSON.stringify(helper)}`);
    }
    return { entry: helper.entry, out: helper.out };
  });
}
