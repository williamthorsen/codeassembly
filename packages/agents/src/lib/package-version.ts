import { createRequire } from 'node:module';

/** Returns this package's version, read through its own `package.json` export so that `src/` and `dist/` agree. */
export function readPackageVersion(): string {
  const packageJson: unknown = createRequire(import.meta.url)('codeassembly/package.json');
  if (typeof packageJson !== 'object' || packageJson === null || !('version' in packageJson)) {
    throw new TypeError('codeassembly/package.json does not declare a version');
  }
  const { version } = packageJson;
  if (typeof version !== 'string') {
    throw new TypeError('codeassembly/package.json does not declare a string version');
  }
  return version;
}
