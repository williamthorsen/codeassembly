import { describe, expect, it } from 'vitest';

import {
  buildFileSearch,
  buildVisualizationsSearch,
  findFileInSearch,
  isVisualizationsSearch,
} from '../file-location.ts';

describe(findFileInSearch, () => {
  it.each(['greeting.prompt-logic.json', 'a b&c.md'])('finds %j in the search string built for it', (name) => {
    expect(findFileInSearch(buildFileSearch(name))).toBe(name);
  });

  it.each(['', '?file=', '?example=refund-request'])('returns undefined when %j names no stored file', (search) => {
    expect(findFileInSearch(search)).toBeUndefined();
  });
});

describe(isVisualizationsSearch, () => {
  it('recognizes the search string built for the Visualizations table', () => {
    expect(isVisualizationsSearch(buildVisualizationsSearch())).toBe(true);
  });

  it.each(['', '?view=other', '?file=visualizations'])('rejects %j', (search) => {
    expect(isVisualizationsSearch(search)).toBe(false);
  });
});
