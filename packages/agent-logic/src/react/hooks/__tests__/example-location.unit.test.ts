// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { examples } from '../../../examples/examples.ts';
import { buildExampleSearch, findExampleInSearch, findUnknownExampleInSearch } from '../example-location.ts';

describe(findExampleInSearch, () => {
  it.each(examples)('finds the $name example in the search string built for it', (example) => {
    expect(findExampleInSearch(buildExampleSearch(example))).toBe(example);
  });

  it.each(['', '?example=', '?example=unknown', '?other=refund-request'])(
    'returns undefined for a search string that names no bundled example (%j)',
    (search) => {
      expect(findExampleInSearch(search)).toBeUndefined();
    },
  );
});

describe(findUnknownExampleInSearch, () => {
  it.each([
    ['?example=unknown', 'unknown'],
    ['?example=', ''],
  ])('returns the value of a search string that names no bundled example (%j)', (search, value) => {
    expect(findUnknownExampleInSearch(search)).toBe(value);
  });

  it.each(['', '?other=x', ...examples.map(buildExampleSearch)])(
    'returns undefined for a search string that names a bundled example or none (%j)',
    (search) => {
      expect(findUnknownExampleInSearch(search)).toBeUndefined();
    },
  );
});
