import { describe, expect, it } from 'vitest';

import { readDeploy } from '../deploy-frontmatter.ts';

describe(readDeploy, () => {
  it('returns declared for an explicit deploy: declared', () => {
    expect(readDeploy('---\nname: x\ndeploy: declared\n---\n\n# Body\n')).toBe('declared');
  });

  it('returns install for an explicit deploy: install', () => {
    expect(readDeploy('---\nname: x\ndeploy: install\n---\n\n# Body\n')).toBe('install');
  });

  it('defaults to install when the deploy field is absent', () => {
    expect(readDeploy('---\nname: x\ndescription: y\n---\n\n# Body\n')).toBe('install');
  });

  it('defaults to install when the file has no frontmatter', () => {
    expect(readDeploy('# Body without frontmatter\n')).toBe('install');
  });

  it('throws a clear error for an unrecognized deploy value, naming the source', () => {
    expect(() => readDeploy('---\nname: x\ndeploy: published\n---\n', 'subagents/canary.md')).toThrow(
      /subagents\/canary\.md.*deploy.*published/i,
    );
  });

  it('throws for a non-string deploy value', () => {
    expect(() => readDeploy('---\nname: x\ndeploy: true\n---\n')).toThrow(/deploy/i);
  });
});
