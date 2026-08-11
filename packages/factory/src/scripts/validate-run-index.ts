import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors/candidate';

import { v2RunIndexSchema } from '../server/adapters/schemas/run-index-schema.js';

// -- core validation logic (exported for testing) --

export interface ValidationResult {
  filePath: string;
  valid: boolean;
  errors: string[];
}

/** Validate a single run-index.json file against the V2 schema. */
export async function validateFile(filePath: string): Promise<ValidationResult> {
  const content = await readFile(filePath, 'utf8');
  const raw: unknown = JSON.parse(content);
  const result = v2RunIndexSchema.safeParse(raw);

  if (result.success) {
    return { filePath, valid: true, errors: [] };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `  ${path}: ${issue.message}` : `  ${issue.message}`;
  });

  return { filePath, valid: false, errors };
}

/** Recursively find all run-index.json files under a directory. */
export async function findRunIndexFiles(dirPath: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      console.error(`Warning: cannot read directory ${dir}: ${describeError(error)}`);
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name === 'run-index.json') {
        found.push(fullPath);
      }
    }
  }

  await walk(dirPath);
  found.sort((a, b) => a.localeCompare(b));
  return found;
}

/** Format and print validation results. Returns the count of failures. */
export function reportResults(results: ValidationResult[]): number {
  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.valid) {
      console.info(`\u{2713} PASS: ${result.filePath}`);
      passed++;
    } else {
      console.info(`\u{2717} FAIL: ${result.filePath}`);
      for (const error of result.errors) {
        console.info(error);
      }
      failed++;
    }
  }

  const total = passed + failed;
  console.info(`\n${passed} passed, ${failed} failed out of ${total} files`);
  return failed;
}

// -- CLI entry point --

/** CLI entry point. Exported for testing. */
export async function main(): Promise<void> {
  const targetPath = process.argv[2];
  if (!targetPath) {
    console.error('Usage: validate-run-index <file-or-directory>');
    process.exitCode = 1;
    return;
  }

  let fileStats;
  try {
    fileStats = await stat(targetPath);
  } catch (error) {
    console.error(`Cannot access path ${targetPath}: ${describeError(error)}`);
    process.exitCode = 1;
    return;
  }

  const filePaths = fileStats.isDirectory() ? await findRunIndexFiles(targetPath) : [targetPath];

  if (filePaths.length === 0) {
    console.info('No run-index.json files found.');
    return;
  }

  const results: ValidationResult[] = [];
  for (const filePath of filePaths) {
    try {
      results.push(await validateFile(filePath));
    } catch (error) {
      const prefix = error instanceof SyntaxError ? 'Invalid JSON' : 'Read error';
      results.push({ filePath, valid: false, errors: [`  ${prefix}: ${describeError(error)}`] });
    }
  }

  const failCount = reportResults(results);
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

// Run only when executed directly (not when imported by tests).
const isDirectRun = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '');
if (isDirectRun) {
  await main();
}
