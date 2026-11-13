import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';

import baseConfig, { commonIgnores, toolIgnores } from '@williamthorsen/eslint-config-typescript';
import { defineConfig, globalIgnores } from 'eslint/config';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { configs as pnpmConfigs } from 'eslint-plugin-pnpm';
import { parse } from 'yaml';

const config = defineConfig([
  ...baseConfig,
  globalIgnores([
    ...commonIgnores,
    ...toolIgnores,
    '**/.playwright-mcp/**',
    // Throwaway spikes live outside the workspace and are exempt from lint.
    'spikes/**',
    // Ignore test fixtures that ESLint's parsers cannot read, marked by a `.malformed` infix.
    '**/__tests__/**/fixtures/**/*.malformed/**',
    '**/__tests__/**/fixtures/**/*.malformed.*',
  ]),
  {
    settings: {
      // `import-x/extensions` needs a resolver to tell a `.js` specifier from the `.ts` file that it names.
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          noWarnOnMultipleProjects: true,
          // Name the tsconfigs explicitly; the resolver's cwd-relative default misses packages when lint runs per workspace.
          project: [
            path.join(import.meta.dirname, 'tsconfig.json'),
            path.join(import.meta.dirname, 'packages/*/tsconfig.json'),
          ],
        }),
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.mts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        // Anchor the project service (enabled by the base config) at the repo root.
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-confusing-void-expression': [
        'warn',
        {
          ignoreArrowShorthand: true,
          ignoreVoidOperator: true,
          ignoreVoidReturningFunctions: true,
        },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowBoolean: true,
          allowNumber: true,
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  ...pnpmConfigs.json,
  ...pnpmConfigs.yaml,
  {
    files: ['package.json', '**/package.json'],
    rules: {
      // A dependency that only one manifest declares stays outside the catalog, so it may keep a literal version.
      'pnpm/json-enforce-catalog': [
        'error',
        { conflicts: 'error', ignores: listSingleConsumerLiterals(import.meta.dirname) },
      ],
    },
  },
]);

export default config;

// region | Helpers
/** Returns whether a value is a plain object whose keys can be read. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lists the names that the workspace's default and named catalogs declare. */
function listCatalogedNames(workspace: Record<string, unknown>): Set<string> {
  const catalogs = [
    workspace['catalog'],
    ...(isRecord(workspace['catalogs']) ? Object.values(workspace['catalogs']) : []),
  ];
  return new Set(catalogs.filter(isRecord).flatMap((catalog) => Object.keys(catalog)));
}

/** Lists the dependencies that exactly one workspace manifest declares with a literal version and the catalog lacks. */
function listSingleConsumerLiterals(root: string): string[] {
  const workspace: unknown = parse(readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8'));
  if (!isRecord(workspace)) throw new Error('pnpm-workspace.yaml does not contain a mapping');
  const patterns = Array.isArray(workspace['packages'])
    ? workspace['packages'].filter((pattern) => typeof pattern === 'string')
    : [];
  const manifestPaths = [
    'package.json',
    ...globSync(patterns.filter((pattern) => !pattern.startsWith('!')).map(toManifestGlob), {
      cwd: root,
      exclude: patterns.filter((pattern) => pattern.startsWith('!')).map(toManifestGlob),
    }),
  ];

  const consumerCounts = new Map<string, number>();
  for (const manifestPath of manifestPaths) {
    const manifest: unknown = JSON.parse(readFileSync(path.join(root, manifestPath), 'utf8'));
    if (!isRecord(manifest)) continue;
    const literalNames = new Set(
      [manifest['dependencies'], manifest['devDependencies']]
        .filter(isRecord)
        .flatMap((dependencies) => Object.entries(dependencies))
        .filter(([, specifier]) => typeof specifier === 'string' && !/^(catalog|file|link|workspace):/.test(specifier))
        .map(([name]) => name),
    );
    for (const name of literalNames) consumerCounts.set(name, (consumerCounts.get(name) ?? 0) + 1);
  }

  const catalogedNames = listCatalogedNames(workspace);
  return [...consumerCounts].filter(([name, count]) => count === 1 && !catalogedNames.has(name)).map(([name]) => name);
}

/** Converts a workspace package pattern, negated or not, into a glob for the manifests that it matches. */
function toManifestGlob(pattern: string): string {
  return path.posix.join(pattern.replace(/^!/, ''), 'package.json');
}
// endregion | Helpers
