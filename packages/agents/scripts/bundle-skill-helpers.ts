/**
 * Build step: bundle each skill's TypeScript helper into a single self-contained `.mjs` placed inside
 * the skill's content directory.
 *
 * A skill installs to a platform directory outside the monorepo, so it cannot import a private workspace package.
 * esbuild bundles the helper with `@codeassembly/kb-core` and its `yaml` / `zod` dependencies inlined, producing
 * a file that runs under `node` with no monorepo packages present on disk.
 * The bundle is written into `content/skills/`, so a subsequent `copy-content.ts` carries it into `dist/content/`
 * and the dev and built layouts both ship the helper.
 *
 * The bundle list is a plain array of `BundleTarget` entries; new skills register themselves by appending one.
 * Each entry may carry an optional `smokeTest` clause that pipes a specific payload and asserts on the result;
 * absent that, the smoke test runs the bundle with no args and empty stdin.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

/** Absolute path to the `@codeassembly/agents` package root. */
export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** One skill helper to bundle: its TypeScript entry point and the `.mjs` output it produces. */
export interface BundleTarget {
  /** Path to the helper's entry module, relative to the package root. */
  entry: string;
  /** Path to the bundled output, relative to the package root. */
  outFile: string;
  /** Optional per-bundle smoke-test invocation. When absent, the bundle is run with no args and empty stdin. */
  smokeTest?: SmokeTestInvocation;
}

/** How the smoke test should invoke a bundle. Stdin is piped only when `stdin` is provided. */
export interface SmokeTestInvocation {
  /** Argv to pass to the bundled `.mjs`. Defaults to no args. */
  args?: readonly string[];
  /** UTF-8 body to pipe on stdin. Defaults to leaving stdin closed (EOF immediately). */
  stdin?: string;
  /**
   * Working directory passed to `spawn`. Defaults to inheriting the parent's cwd. Bundles whose
   * output depends on the surrounding filesystem (preferences files, branch manifest) should
   * point this at a self-contained fixture directory so the smoke test is hermetic.
   */
  cwd?: string;
  /**
   * Environment-variable overrides passed to `spawn`. Bundles that read the ambient `HOME` (e.g.,
   * to discover `~/.agents/preferences.yaml`) should set `HOME` here to keep the smoke test from
   * depending on the developer's actual home directory contents.
   */
  env?: NodeJS.ProcessEnv;
  /** Optional structural assertion run against the parsed stdout JSON. Throw to signal failure. */
  assertResult?: (result: unknown) => void;
}

/** Every skill helper bundle; the smoke test reuses this list to exercise each built `.mjs`. */
export const targets: BundleTarget[] = [
  {
    entry: 'src/kb-add/cli.ts',
    outFile: 'content/skills/kb-add/kb-add.mjs',
  },
  {
    entry: 'src/kb-edit/cli.ts',
    outFile: 'content/skills/kb-edit/kb-edit.mjs',
    smokeTest: makeKbEditSmokeTest(),
  },
  {
    entry: 'src/kb-curate/cli.ts',
    outFile: 'content/skills/kb-curate/kb-curate.mjs',
    smokeTest: makeKbCurateSmokeTest(),
  },
  {
    entry: 'src/kb-retrieve/cli.ts',
    outFile: 'content/skills/kb-retrieve/kb-retrieve.mjs',
  },
  {
    entry: 'src/update-jira-ticket/cli.ts',
    outFile: 'content/skills/update-jira-ticket/update-jira-ticket.mjs',
    smokeTest: {
      stdin: '<p><strong><code>x</code></strong></p>',
      assertResult: assertCompositionViolationFinding,
    },
  },
  {
    entry: 'src/derive-session-context/cli.ts',
    outFile: 'content/skills/derive-session-context/derive-session-context.mjs',
    smokeTest: makeDeriveSessionContextSmokeTest(),
  },
  {
    entry: 'src/capture-event/cli.ts',
    outFile: 'content/skills/capture-event/capture-event.mjs',
    smokeTest: makeCaptureEventSmokeTest(),
  },
];

/**
 * Stands up a kind-aware event store plus an isolated home registering it, and a throwaway git repo with an `origin`
 * remote, then returns a `SmokeTestInvocation` that captures a single `observation` against them. Exercises the full
 * resolve-by-name → load kind-aware schema → validate spine → write pipeline end to end, which is the only path that
 * wires the bundled resolver, schema loader, and immutable write together. The store's own `schema.yaml` declares the
 * `event` kind, so the per-type required-set validation is genuinely run.
 *
 * The fixtures are process-lifetime — `mkdtempSync` runs at module load and the OS reclaims short-lived temp
 * directories without explicit cleanup.
 */
function makeCaptureEventSmokeTest(): SmokeTestInvocation {
  const storePath = mkdtempSync(path.join(tmpdir(), 'capture-event-store-'));
  mkdirSync(path.join(storePath, '.kb'), { recursive: true });
  writeFileSync(
    path.join(storePath, '.kb', 'schema.yaml'),
    [
      'kinds:',
      '  event:',
      '    immutable: true',
      '    recall: recurrence-recency',
      '    required: [id, type, captured-at, session, cwd, repo, summary]',
      '    optional: [skill, model, tags, owner, locality, severity]',
      '    types:',
      '      observation: {}',
      '      mistake:',
      '        required: [correction]',
      '',
    ].join('\n'),
    'utf8',
  );

  const home = mkdtempSync(path.join(tmpdir(), 'capture-event-home-'));
  mkdirSync(path.join(home, '.agents'), { recursive: true });
  writeFileSync(path.join(home, '.agents', 'kb.yaml'), `kbs:\n  codeassembly:\n    path: ${storePath}\n`, 'utf8');

  const repo = mkdtempSync(path.join(tmpdir(), 'capture-event-repo-'));
  execFileSync('git', ['-C', repo, 'init', '--quiet']);
  execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:williamthorsen/codeassembly.git']);

  return {
    args: ['--type', 'observation', '--summary', 'Smoke-test observation'],
    cwd: repo,
    env: { ...process.env, HOME: home, CLAUDE_CODE_SESSION_ID: 'smoke-session' },
    assertResult: assertCaptureEventSmokeResult,
  };
}

/** Assert the capture-event smoke produced an ok result with a ULID id, ISO-8601 capturedAt, and a written path. */
function assertCaptureEventSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from capture-event');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (typeof result.id !== 'string' || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(result.id)) {
    throw new Error(`expected a ULID-shaped id, got ${JSON.stringify(result.id)}`);
  }
  if (typeof result.capturedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(result.capturedAt)) {
    throw new Error(`expected an ISO-8601 capturedAt, got ${JSON.stringify(result.capturedAt)}`);
  }
  if (typeof result.path !== 'string' || !result.path.endsWith(`${result.id}.md`)) {
    throw new Error(`expected a written record path ending in {id}.md, got ${JSON.stringify(result.path)}`);
  }
}

/**
 * Builds a fixture directory containing a minimal preferences file and returns a `SmokeTestInvocation`
 * that drives the deriver against it with a known branch name. The deriver's output depends on the
 * surrounding cwd and the current git branch, so the smoke test cannot use the ambient environment.
 * `mkdtempSync` runs at module load and the directory is process-lifetime — short-lived OS temp
 * directories are reclaimed without explicit cleanup.
 */
function makeDeriveSessionContextSmokeTest(): SmokeTestInvocation {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'derive-session-context-smoke-'));
  mkdirSync(path.join(fixtureDir, '.agents'), { recursive: true });
  writeFileSync(path.join(fixtureDir, '.agents', 'preferences.yaml'), 'project:\n  slug: smoke-test-project\n', 'utf8');
  return {
    // `--home` points at the fixture so the deriver does not read the developer's real
    // `~/.agents/preferences.yaml` (whose schema-validity is environment-specific). Using the flag
    // rather than the `HOME` env var avoids breaking PATH-resolution tools (e.g., asdf shims) that
    // depend on the real `HOME`.
    args: ['--branch', 'MAC-999/feat/smoke-fixture', '--cwd', fixtureDir, '--home', fixtureDir],
    assertResult: assertDeriveSessionContextOutput,
    cwd: fixtureDir,
  };
}

/** Assert the deriver emitted the expected field set for the smoke fixture. */
function assertDeriveSessionContextOutput(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from derive-session-context');
  }
  if (result.ticket_id !== 'MAC-999') {
    throw new Error(`expected ticket_id "MAC-999", got ${JSON.stringify(result.ticket_id)}`);
  }
  if (result.project_slug !== 'smoke-test-project') {
    throw new Error(`expected project_slug "smoke-test-project", got ${JSON.stringify(result.project_slug)}`);
  }
  if (result.branch_name !== 'MAC-999/feat/smoke-fixture') {
    throw new Error(`expected branch_name "MAC-999/feat/smoke-fixture", got ${JSON.stringify(result.branch_name)}`);
  }
  // `artifact_base_dir` is resolved by `resolveBaseDir`: the default `~/ai-artifacts` is expanded
  // against the `--home` flag (set to the fixture dir in `makeDeriveSessionContextSmokeTest`).
  // The bundled deriver is the only end-to-end path that exercises this expansion against a real
  // `os.homedir()`-equivalent argument, so the smoke test is the natural place to assert it.
  if (typeof result.artifact_base_dir !== 'string' || !result.artifact_base_dir.includes('ai-artifacts')) {
    throw new Error(
      `expected artifact_base_dir to include "ai-artifacts", got ${JSON.stringify(result.artifact_base_dir)}`,
    );
  }
  // `default_branch` comes from `composeManifest`'s remote-name resolution; the smoke fixture has
  // no `repository.default_remote` configured, so the default `origin/main` should surface.
  if (result.default_branch !== 'origin/main') {
    throw new Error(`expected default_branch "origin/main", got ${JSON.stringify(result.default_branch)}`);
  }
}

/**
 * Type guard: narrows `value` to a plain object with unknown property values.
 *
 * Intentionally kept local rather than imported from `src/lib/type-guards.ts`: this build
 * script sits outside the runtime surface, and importing runtime source into build tooling
 * would couple the two for the sake of a one-line guard.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Stands up a fixture KB with a single seed note and returns a `SmokeTestInvocation` that runs the bundle with
 * `--bump-updated` against it. Exercises the load → mutate → write-back pipeline end to end, which is the only
 * code path that wires the bundled `parseNote`, schema loader, and atomic write together. `HOME` is overridden to
 * the fixture dir so the dev's real `~/.claude/kb.yaml` does not pollute KB resolution.
 *
 * The fixture is process-lifetime — `mkdtempSync` runs at module load and the OS reclaims short-lived temp
 * directories without explicit cleanup. The seed note's `updated:` field is bumped by every invocation;
 * `--bump-updated` is idempotent at the field level so re-runs within the same day are no-ops on disk.
 */
function makeKbEditSmokeTest(): SmokeTestInvocation {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'kb-edit-smoke-'));
  mkdirSync(path.join(fixtureDir, '.kb'), { recursive: true });
  const notePath = path.join(fixtureDir, 'Smoke.md');
  writeFileSync(
    notePath,
    '---\ntitle: Smoke\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [smoke]\n---\n\nSmoke body.\n',
    'utf8',
  );
  return {
    args: [notePath, '--bump-updated'],
    cwd: fixtureDir,
    env: { ...process.env, HOME: fixtureDir },
    assertResult: assertKbEditSmokeResult,
  };
}

/** Assert the kb-edit smoke produced an ok bump-updated result with a today-shaped `updated:` field. */
function assertKbEditSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from kb-edit');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (result.operation !== 'bump-updated') {
    throw new Error(`expected operation 'bump-updated', got ${JSON.stringify(result.operation)}`);
  }
  const frontmatter = result.frontmatter;
  if (!isRecord(frontmatter)) {
    throw new TypeError('expected frontmatter object on kb-edit result');
  }
  if (typeof frontmatter.updated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(frontmatter.updated)) {
    throw new Error(`expected updated to be YYYY-MM-DD, got ${JSON.stringify(frontmatter.updated)}`);
  }
}

/**
 * Stands up a fixture KB with a single seed note and returns a `SmokeTestInvocation` that runs the bundle read-only
 * over it. Exercises the resolve → enumerate → detect pipeline end to end. `HOME` is overridden to the fixture dir
 * so the dev's real registry does not pollute KB resolution.
 */
function makeKbCurateSmokeTest(): SmokeTestInvocation {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'kb-curate-smoke-'));
  mkdirSync(path.join(fixtureDir, '.kb'), { recursive: true });
  writeFileSync(
    path.join(fixtureDir, 'Smoke.md'),
    '---\ntitle: Smoke\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [smoke]\n---\n\nSmoke body.\n',
    'utf8',
  );
  return {
    args: [],
    cwd: fixtureDir,
    env: { ...process.env, HOME: fixtureDir },
    assertResult: assertKbCurateSmokeResult,
  };
}

/** Assert the kb-curate smoke produced an ok read-only report with an array-valued `findings`. */
function assertKbCurateSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from kb-curate');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (result.mode !== 'report') {
    throw new Error(`expected mode 'report', got ${JSON.stringify(result.mode)}`);
  }
  if (!Array.isArray(result.findings)) {
    throw new TypeError(`expected findings to be an array, got ${JSON.stringify(result.findings)}`);
  }
}

/** Assert the parsed smoke-test result reports a composition-code-inline-mark finding. */
function assertCompositionViolationFinding(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result');
  }
  if (result.ok !== false) {
    throw new Error(`expected ok: false, got ${JSON.stringify(result.ok)}`);
  }
  const findings = result.findings;
  if (!Array.isArray(findings) || findings.length === 0) {
    throw new Error('expected non-empty findings array');
  }
  const rules = findings.map((entry: unknown) => (isRecord(entry) ? entry.rule : undefined));
  if (!rules.includes('composition-code-inline-mark')) {
    throw new Error(`expected composition-code-inline-mark finding; got rules: ${JSON.stringify(rules)}`);
  }
}

// A CommonJS dependency (`yaml`) reaches Node built-ins via bare `require('process')` calls.
// esbuild's ESM output otherwise has no `require`, so this banner restores a real one via `createRequire`.
const requireShim =
  "import { createRequire as __cjsCreateRequire } from 'node:module';\nconst require = __cjsCreateRequire(import.meta.url);";

/** Bundles every skill helper in `targets`, writing each `.mjs` into its skill's content directory. */
export async function bundleSkillHelpers(): Promise<void> {
  for (const target of targets) {
    await build({
      entryPoints: [path.join(packageRoot, target.entry)],
      outfile: path.join(packageRoot, target.outFile),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'es2022',
      banner: { js: requireShim },
      // Resolve `@codeassembly/kb-core` (and any future workspace dep) from its `source` `.ts` export
      // condition so the bundle does not require those packages to be pre-built.
      conditions: ['source'],
    });
    console.info(`Bundled ${target.entry} -> ${target.outFile}`);
  }
}

// Run as a build step, but stay importable (the smoke test reuses `targets` and `bundleSkillHelpers`).
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await bundleSkillHelpers();
}
