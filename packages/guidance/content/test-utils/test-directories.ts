/** The directory names holding test code rather than deliverable content. */
const TEST_DIRECTORY_NAMES: ReadonlySet<string> = new Set(['__tests__', 'test-utils']);

/** True when a directory entry holds test code rather than deliverable content. */
export function isTestDirectory(name: string): boolean {
  return TEST_DIRECTORY_NAMES.has(name);
}
