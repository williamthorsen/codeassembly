import { describe, expect, it } from 'vitest';
import type { core } from 'zod';

import type { RunDataParseErrorCategory } from '../run-data-parse-error.js';
import { RunDataParseError } from '../run-data-parse-error.js';

describe('RunDataParseError', () => {
  it('is an instance of Error', () => {
    const error = new RunDataParseError('test', 'corrupt_json', '/path/to/file.json');

    expect(error).toBeInstanceOf(Error);
  });

  it('has name set to RunDataParseError', () => {
    const error = new RunDataParseError('test', 'corrupt_json', '/path/to/file.json');

    expect(error.name).toBe('RunDataParseError');
  });

  it('preserves the message', () => {
    const error = new RunDataParseError('Failed to parse JSON at /path/to/file.json', 'corrupt_json', '/path/to/file.json');

    expect(error.message).toBe('Failed to parse JSON at /path/to/file.json');
  });

  it('stores category, filePath, and zodIssues fields', () => {
    const issues: core.$ZodIssue[] = [
      { code: 'invalid_type', expected: 'string', path: ['runId'], message: 'Expected string' },
    ];
    const error = new RunDataParseError(
      'Invalid run-index.json at /path',
      'invalid_schema',
      '/path/run-index.json',
      issues,
    );

    expect(error.category).toBe('invalid_schema');
    expect(error.filePath).toBe('/path/run-index.json');
    expect(error.zodIssues).toBe(issues);
  });

  it('has undefined zodIssues when not provided', () => {
    const error = new RunDataParseError('test', 'missing_companion', '/path/to/file.json');

    expect(error.zodIssues).toBeUndefined();
  });

  it.each<RunDataParseErrorCategory>(['corrupt_json', 'invalid_schema', 'missing_companion'])(
    'accepts category "%s"',
    (category) => {
      const error = new RunDataParseError('test', category, '/path');

      expect(error.category).toBe(category);
    },
  );
});
