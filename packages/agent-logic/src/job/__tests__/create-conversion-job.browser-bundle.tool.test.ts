import { builtinModules } from 'node:module';
import path from 'node:path';

import { build, type Plugin } from 'vite';
import { describe, expect, it } from 'vitest';

const JOB_ENTRY = path.resolve(import.meta.dirname, '../index.ts');

describe('the ./job entry', () => {
  it('bundles for the browser without a Node built-in', async () => {
    const code = await bundleForBrowser(JOB_ENTRY);

    expect(code).toContain('submit_draft');
  });

  it('fails to bundle an entry that imports a Node built-in', async () => {
    await expect(bundleForBrowser(path.resolve(import.meta.dirname, 'fixtures/node-import-entry.ts'))).rejects.toThrow(
      /imports the Node built-in `node:path`/,
    );
  });
});

// region | Helpers
/** Bundles `entry` as a browser library in memory and returns its code, failing on any import of a Node built-in. */
async function bundleForBrowser(entry: string): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [refuseNodeBuiltins()],
    build: {
      lib: { entry, formats: ['es'], fileName: 'bundle' },
      write: false,
      rollupOptions: { external: [/^@williamthorsen\/toolbelt\.llm(\/|$)/] },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs
    .flatMap((output) => ('output' in output ? output.output : []))
    .map((chunk) => (chunk.type === 'chunk' ? chunk.code : ''))
    .join('\n');
}

/** Returns a plugin that rejects every import of a Node built-in, which Vite would otherwise externalize with a warning. */
function refuseNodeBuiltins(): Plugin {
  const builtins = new Set(builtinModules);
  return {
    name: 'refuse-node-builtins',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source.startsWith('node:') || builtins.has(source)) {
        throw new Error(`${importer ?? 'The entry'} imports the Node built-in \`${source}\`.`);
      }
      return undefined;
    },
  };
}
// endregion | Helpers
