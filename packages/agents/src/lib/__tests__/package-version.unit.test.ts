import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readPackageVersion } from '../package-version.ts';

describe(readPackageVersion, () => {
  it("returns the version declared in this package's package.json", () => {
    const packageJson: unknown = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, '../../../package.json'), 'utf8'),
    );

    expect(packageJson).toMatchObject({ version: readPackageVersion() });
  });
});
