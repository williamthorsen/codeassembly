/**
 * Smoke-test utilities: fixture builders and assertions for the skill-helper smoke test.
 *
 * Each `make*SmokeTest` builder stands up a hermetic fixture (a temp store, an isolated home, and a throwaway git repo
 * where needed) and returns a `SmokeTestInvocation` describing how to run one bundle and assert on its output. The
 * runner in `../__tests__/smoke-test-skill-helpers.ts` pairs each bundle with its builder and calls it; nothing here
 * runs on import, so loading this module has no side effects.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { CONTENT_DIR, resolveEventPath, resolveEventsDir, resolveKbDir } from '@codeassembly/kb/layout';

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

/**
 * Stands up an event store plus an isolated home registering it as `default_kb`, and a throwaway git repo with an
 * `origin` remote, then returns a `SmokeTestInvocation` that captures a single event against them with `--store
 * @default`. Exercises the full `@default` sentinel resolution → validate the `event` record's spine via `parseEvent` →
 * write pipeline end to end, which is the only path that wires the bundled resolver, the per-type record layer, and the
 * immutable write together.
 */
export function makeCaptureEventSmokeTest(): SmokeTestInvocation {
  const storePath = mkdtempSync(path.join(tmpdir(), 'capture-event-store-'));
  mkdirSync(resolveKbDir(storePath), { recursive: true });

  const home = mkdtempSync(path.join(tmpdir(), 'capture-event-home-'));
  mkdirSync(path.join(home, '.agents'), { recursive: true });
  writeFileSync(
    path.join(home, '.agents', 'kb.yaml'),
    `default_kb: codeassembly\nkbs:\n  codeassembly:\n    path: ${storePath}\n`,
    'utf8',
  );

  const repo = mkdtempSync(path.join(tmpdir(), 'capture-event-repo-'));
  execFileSync('git', ['-C', repo, 'init', '--quiet']);
  execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:williamthorsen/codeassembly.git']);

  return {
    args: ['--summary', 'Smoke-test event', '--store', '@default'],
    cwd: repo,
    env: { ...process.env, HOME: home, CLAUDE_CODE_SESSION_ID: 'smoke-session' },
    assertResult: assertCaptureEventSmokeResult,
  };
}

/**
 * Builds a fixture directory containing a minimal preferences file and returns a `SmokeTestInvocation`
 * that drives the deriver against it with a known branch name. The deriver's output depends on the
 * surrounding cwd and the current git branch, so the smoke test cannot use the ambient environment.
 * `mkdtempSync` runs when the smoke-test runner loads and the directory is process-lifetime — short-lived
 * OS temp directories are reclaimed without explicit cleanup.
 */
export function makeDeriveSessionContextSmokeTest(): SmokeTestInvocation {
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

/**
 * Stands up an isolated home holding one nested-schema feedback memory under a memory store, then returns a
 * `SmokeTestInvocation` that runs `enumerate` against it. `HOME` points the projects-root walk at the fixture and an
 * empty `CLAUDE_CONFIG_DIR` neutralizes any ambient value, so the enumeration never touches the developer's real
 * `~/.claude`. Exercises the full projects-root resolution → store walk → frontmatter parse → feedback filter pipeline.
 */
export function makeFeedbackMemoriesSmokeTest(): SmokeTestInvocation {
  const home = mkdtempSync(path.join(tmpdir(), 'feedback-memories-home-'));
  const memoryDir = path.join(home, '.claude', 'projects', '-store-smoke', 'memory');
  mkdirSync(memoryDir, { recursive: true });
  writeFileSync(
    path.join(memoryDir, 'feedback-smoke-example.md'),
    [
      '---',
      'name: feedback-smoke-example',
      'description: a smoke-test feedback memory',
      'metadata:',
      '  node_type: memory',
      '  type: feedback',
      '  originSessionId: smoke-session',
      '---',
      '',
      'Smoke body.',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    path.join(memoryDir, 'MEMORY.md'),
    '# Memory\n\n## Feedback\n\n- [x](feedback-smoke-example.md): x\n',
    'utf8',
  );

  return {
    args: ['enumerate'],
    env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: '' },
    assertResult: assertFeedbackMemoriesSmokeResult,
  };
}

/**
 * Stands up a fixture KB with a single seed note and returns a `SmokeTestInvocation` that runs the bundle read-only
 * over it. Exercises the resolve → enumerate → detect pipeline end to end. `HOME` is overridden to the fixture dir
 * so the dev's real registry does not pollute KB resolution.
 */
export function makeKbCurateSmokeTest(): SmokeTestInvocation {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'kb-curate-smoke-'));
  mkdirSync(resolveKbDir(fixtureDir), { recursive: true });
  // The seed note lives under `content/` so the store's default `targets: ['content/**/*.md']` enumerates it; a note
  // at the store root would not match and the smoke test would silently report zero notes. The note links to a
  // missing target so a successful enumeration always yields a `wikilinks.unresolved` finding — the proof, below,
  // that the bundle enumerated the note rather than reporting an empty vault.
  mkdirSync(path.join(fixtureDir, CONTENT_DIR), { recursive: true });
  writeFileSync(
    path.join(fixtureDir, CONTENT_DIR, 'Smoke.md'),
    '---\ntitle: Smoke\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [smoke]\ntype: howto\n---\n\nSee [[Missing target]].\n',
    'utf8',
  );
  return {
    args: [],
    cwd: fixtureDir,
    env: { ...process.env, HOME: fixtureDir },
    assertResult: assertKbCurateSmokeResult,
  };
}

/**
 * Stands up a fixture KB with a single seed note and returns a `SmokeTestInvocation` that runs the bundle with
 * `--bump-updated` against it. Exercises the load → mutate → write-back pipeline end to end, which is the only
 * code path that wires the bundled record parse, mutation, and atomic write together. `HOME` is overridden to
 * the fixture dir so the dev's real `~/.claude/kb.yaml` does not pollute KB resolution.
 *
 * The fixture is process-lifetime — `mkdtempSync` runs when the smoke-test runner loads and the OS reclaims
 * short-lived temp directories without explicit cleanup. The seed note's `updated:` field is rewritten to the
 * current instant on every invocation.
 */
export function makeKbEditSmokeTest(): SmokeTestInvocation {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'kb-edit-smoke-'));
  mkdirSync(resolveKbDir(fixtureDir), { recursive: true });
  const notePath = path.join(fixtureDir, 'Smoke.md');
  writeFileSync(
    notePath,
    '---\ntitle: Smoke\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [smoke]\ntype: howto\n---\n\nSmoke body.\n',
    'utf8',
  );
  return {
    args: [notePath, '--bump-updated'],
    cwd: fixtureDir,
    env: { ...process.env, HOME: fixtureDir },
    assertResult: assertKbEditSmokeResult,
  };
}

/**
 * Stands up an event store carrying a single seed event plus an isolated home registering it as `default_kb`, then
 * returns a `SmokeTestInvocation` that recalls the event by a body term scoped to that store. Exercises the full scope →
 * ripgrep recall → note-set scoping → event projection pipeline, the only path that wires the bundled search primitive
 * and the event projection together. `ripgrep` (`rg`) must be on PATH for recall to find the seed event.
 */
export function makeKbRetrieveEventsSmokeTest(): SmokeTestInvocation {
  const storePath = mkdtempSync(path.join(tmpdir(), 'kb-retrieve-events-store-'));
  mkdirSync(resolveKbDir(storePath), { recursive: true });

  mkdirSync(resolveEventsDir(storePath), { recursive: true });
  writeFileSync(
    resolveEventPath({ storePath, id: 'smoke-event' }),
    [
      '---',
      'recordType: event',
      'id: smoke-event',
      'captured-at: 2026-06-18T09:41:02Z',
      'session: smoke',
      'cwd: /tmp/smoke',
      'summary: Smoke retrieve event',
      'repo: owner/repo-smoke',
      '---',
      '',
      'A smoke note mentioning retrievesmokequux.',
      '',
    ].join('\n'),
    'utf8',
  );

  const home = mkdtempSync(path.join(tmpdir(), 'kb-retrieve-events-home-'));
  mkdirSync(path.join(home, '.agents'), { recursive: true });
  writeFileSync(
    path.join(home, '.agents', 'kb.yaml'),
    `default_kb: codeassembly\nkbs:\n  codeassembly:\n    path: ${storePath}\n`,
    'utf8',
  );

  return {
    args: ['retrievesmokequux', '--store', 'codeassembly'],
    env: { ...process.env, HOME: home },
    assertResult: assertKbRetrieveEventsSmokeResult,
  };
}

/**
 * Stands up an event store carrying a seed event plus an isolated home registering it as `default_kb`, then returns a
 * `SmokeTestInvocation` that marks the event `addressed-by` a reference with `--store @default`. Exercises the full
 * `@default` resolution → read → parse → mutate → atomic write pipeline, the only path that wires the bundled resolver,
 * the per-type record layer, and the note-io writer together. The assertion confirms the reference landed and that no
 * `title`/`created`/`updated` was injected onto the event.
 */
export function makeKbUpdateEventsSmokeTest(): SmokeTestInvocation {
  const storePath = mkdtempSync(path.join(tmpdir(), 'kb-update-events-store-'));
  mkdirSync(resolveKbDir(storePath), { recursive: true });

  mkdirSync(resolveEventsDir(storePath), { recursive: true });
  const eventPath = resolveEventPath({ storePath, id: 'smoke-event' });
  writeFileSync(
    eventPath,
    [
      '---',
      'recordType: event',
      'id: smoke-event',
      'captured-at: 2026-06-18T09:41:02Z',
      'session: smoke',
      'cwd: /tmp/smoke',
      'summary: Smoke event',
      '---',
      '',
      'Body.',
      '',
    ].join('\n'),
    'utf8',
  );

  const home = mkdtempSync(path.join(tmpdir(), 'kb-update-events-home-'));
  mkdirSync(path.join(home, '.agents'), { recursive: true });
  writeFileSync(
    path.join(home, '.agents', 'kb.yaml'),
    `default_kb: codeassembly\nkbs:\n  codeassembly:\n    path: ${storePath}\n`,
    'utf8',
  );

  return {
    args: ['--store', '@default', '--add-addressed-by', '#849', 'smoke-event'],
    env: { ...process.env, HOME: home },
    assertResult: (result) => assertKbUpdateEventsSmokeResult(result, eventPath),
  };
}

/**
 * Stands up a throwaway git repo on a known branch with an `origin` remote, plus a fixture events root, then returns a
 * `SmokeTestInvocation` that pipes a Claude `SessionStart` payload at the relay exactly as the harness would.
 *
 * The bundle is the only place the relay's stdin read is exercised against a real pipe: the unit suite hands `runRelay`
 * a string, so a regression in the stream read — the one thing standing between a hook firing and an event existing —
 * would pass unit tests and fail silently in every installed harness.
 */
export function makeRelayHookEventSmokeTest(): SmokeTestInvocation {
  const home = mkdtempSync(path.join(tmpdir(), 'relay-hook-event-home-'));

  const repo = mkdtempSync(path.join(tmpdir(), 'relay-hook-event-repo-'));
  execFileSync('git', ['-C', repo, 'init', '--quiet', '--initial-branch=1005/smoke']);
  execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:williamthorsen/codeassembly.git']);

  const expectedPath = path.join(
    home,
    '.codeassembly',
    'events',
    'williamthorsen',
    'codeassembly',
    '1005-smoke',
    'smoke-session.jsonl',
  );

  return {
    args: ['--harness', 'claude', '--hook', 'SessionStart', '--home', home],
    stdin: JSON.stringify({
      session_id: 'smoke-session',
      cwd: repo,
      hook_event_name: 'SessionStart',
      source: 'startup',
    }),
    assertResult: (result) => assertRelayHookEventSmokeResult(result, expectedPath),
  };
}

/**
 * Returns a `SmokeTestInvocation` that pipes an HTML fragment wrapping inline code in bold — a composition violation —
 * and asserts the checker reports a `composition-code-inline-mark` finding.
 */
export function makeUpdateJiraTicketSmokeTest(): SmokeTestInvocation {
  return {
    stdin: '<p><strong><code>x</code></strong></p>',
    assertResult: assertCompositionViolationFinding,
  };
}

/**
 * Assert the capture-event smoke produced an ok result with a ULID id, ISO-8601 capturedAt, a written path carrying
 * the stored `recordType: event` discriminant, and no bare `type` field.
 */
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
  const written = readFileSync(result.path, 'utf8');
  if (!/^recordType: event$/m.test(written)) {
    throw new Error(`expected the written event to carry recordType: event, got:\n${written}`);
  }
  if (/^type:/m.test(written)) {
    throw new Error(`expected the written event to omit a bare type field, got:\n${written}`);
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

/** Asserts that the deriver emitted the expected field set for the smoke fixture. */
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
 * Assert the feedback-memories smoke enumerated exactly the seeded feedback memory, reading its slug and the
 * origin session id from the nested `metadata` schema.
 */
function assertFeedbackMemoriesSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from feedback-memories');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (!Array.isArray(result.memories) || result.memories.length !== 1) {
    throw new Error(`expected exactly one enumerated memory, got ${JSON.stringify(result.memories)}`);
  }
  const memory: unknown = result.memories[0];
  if (!isRecord(memory) || memory.slug !== 'feedback-smoke-example') {
    throw new Error(`expected the seeded feedback memory, got ${JSON.stringify(memory)}`);
  }
  if (memory.originSessionId !== 'smoke-session') {
    throw new Error(`expected originSessionId from nested metadata, got ${JSON.stringify(memory.originSessionId)}`);
  }
}

/**
 * Asserts that the kb-curate smoke produced an ok read-only report that actually enumerated the seed note. The seed
 * note carries an unresolved wikilink, so a non-empty enumeration always surfaces a `wikilinks.unresolved` finding; its
 * absence means the bundle enumerated nothing — a broken `content/` scoping must fail here rather than pass with an
 * empty report.
 */
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
  const rules = result.findings.map((entry: unknown) => (isRecord(entry) ? entry.rule : undefined));
  if (!rules.includes('wikilinks.unresolved')) {
    throw new Error(`expected the smoke run to enumerate the seed note; got rules: ${JSON.stringify(rules)}`);
  }
}

/** Asserts that the kb-edit smoke produced an ok bump-updated result with second-precision UTC `updated:` timestamp. */
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
  const record = result.record;
  if (!isRecord(record)) {
    throw new TypeError('expected record object on kb-edit result');
  }
  if (typeof record.updated !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.updated)) {
    throw new Error(`expected updated to be YYYY-MM-DDTHH:MM:SSZ, got ${JSON.stringify(record.updated)}`);
  }
}

/** Assert the kb-retrieve-events smoke recalled the seed event and projected it with its summary and capture timestamp. */
function assertKbRetrieveEventsSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from kb-retrieve-events');
  }
  if (!Array.isArray(result.candidates) || result.candidates.length === 0) {
    throw new Error(`expected at least one event candidate, got ${JSON.stringify(result)}`);
  }
  const candidate: unknown = result.candidates[0];
  if (!isRecord(candidate)) {
    throw new TypeError('expected a candidate object');
  }
  if (candidate.summary !== 'Smoke retrieve event') {
    throw new Error(`expected summary 'Smoke retrieve event', got ${JSON.stringify(candidate.summary)}`);
  }
  if (typeof candidate.capturedAt !== 'string' || !candidate.capturedAt.includes('2026-06-18')) {
    throw new Error(`expected an ISO capturedAt, got ${JSON.stringify(candidate.capturedAt)}`);
  }
}

/**
 * Assert the kb-update-events smoke produced an ok batch whose one event updated, with the reference written to its
 * `addressed-by` list and no assertion fields injected.
 */
function assertKbUpdateEventsSmokeResult(result: unknown, eventPath: string): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from kb-update-events');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (result.operation !== 'add-addressed-by') {
    throw new Error(`expected operation 'add-addressed-by', got ${JSON.stringify(result.operation)}`);
  }
  if (!Array.isArray(result.results) || result.results.length !== 1) {
    throw new Error(`expected one per-event result, got ${JSON.stringify(result.results)}`);
  }
  const entry: unknown = result.results[0];
  if (!isRecord(entry) || entry.ok !== true) {
    throw new Error(`expected the event to update, got ${JSON.stringify(entry)}`);
  }
  const written = readFileSync(eventPath, 'utf8');
  if (!/^addressed-by:/m.test(written)) {
    throw new Error(`expected the written event to carry addressed-by, got:\n${written}`);
  }
  if (!written.includes('#849')) {
    throw new Error(`expected the written event to reference #849, got:\n${written}`);
  }
  if (/^(title|created|updated):/m.test(written)) {
    throw new Error(`expected no assertion fields injected, got:\n${written}`);
  }
}

/**
 * Assert the relay smoke read its payload from the pipe and appended a `session.started` envelope at the path the
 * payload's `cwd` implies — attribution the relay could only have derived from stdin, since it was spawned elsewhere.
 */
function assertRelayHookEventSmokeResult(result: unknown, expectedPath: string): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from relay-hook-event');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (result.path !== expectedPath) {
    throw new Error(`expected the event at ${expectedPath}, got ${JSON.stringify(result.path)}`);
  }

  const lines = readFileSync(expectedPath, 'utf8').split('\n').filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(`expected exactly one appended line, got ${lines.length}`);
  }
  const envelope: unknown = JSON.parse(lines[0] ?? '');
  if (!isRecord(envelope)) {
    throw new TypeError(`expected the appended line to be a JSON object, got: ${lines[0]}`);
  }
  const expectedFields: Record<string, unknown> = {
    type: 'session.started',
    repo: 'williamthorsen/codeassembly',
    branch: '1005/smoke',
    session: 'smoke-session',
    harness: 'claude',
  };
  for (const [field, expected] of Object.entries(expectedFields)) {
    if (envelope[field] !== expected) {
      throw new Error(`expected ${field} ${JSON.stringify(expected)}, got ${JSON.stringify(envelope[field])}`);
    }
  }
  if (!isRecord(envelope.payload) || envelope.payload.source !== 'startup') {
    throw new Error(`expected the start discriminator to pass through, got ${JSON.stringify(envelope.payload)}`);
  }
}

/**
 * Stands up a throwaway git repo on a known branch with an `origin` remote, plus a fixture events root, then returns a
 * `SmokeTestInvocation` that emits one event against them. Exercises the full context-autofill → envelope → append
 * pipeline: the git-derived `repo` and `branch`, the relayed `--session`, and the single-line append are only wired
 * together in the built bundle.
 *
 * The branch is pinned via `--initial-branch` so the expected path is deterministic; the ambient git config could
 * otherwise name the initial branch anything. `--home` points the events root at the fixture rather than overriding
 * `HOME`, which would break PATH-resolution tools that depend on the real one (the hazard the deriver's smoke test
 * documents).
 */
export function makeEmitEventSmokeTest(): SmokeTestInvocation {
  const home = mkdtempSync(path.join(tmpdir(), 'emit-event-home-'));

  const repo = mkdtempSync(path.join(tmpdir(), 'emit-event-repo-'));
  execFileSync('git', ['-C', repo, 'init', '--quiet', '--initial-branch=986/smoke']);
  execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:williamthorsen/codeassembly.git']);

  const expectedPath = path.join(
    home,
    '.codeassembly',
    'events',
    'williamthorsen',
    'codeassembly',
    '986-smoke',
    'smoke-session.jsonl',
  );

  return {
    args: [
      '--type',
      'skill.started',
      '--payload',
      '{"skill":"emit-event"}',
      '--harness',
      'claude',
      '--session',
      'smoke-session',
      '--home',
      home,
    ],
    cwd: repo,
    assertResult: (result) => assertEmitEventSmokeResult(result, expectedPath, repo),
  };
}

/**
 * Assert the emit-event smoke appended an envelope at the path the derived context implies, and that the line on disk
 * parses with the autofilled `repo`/`branch`/`session`/`cwd`, the injected harness, and the supplied payload.
 */
function assertEmitEventSmokeResult(result: unknown, expectedPath: string, repo: string): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from emit-event');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (result.path !== expectedPath) {
    throw new Error(`expected the event at ${expectedPath}, got ${JSON.stringify(result.path)}`);
  }

  const lines = readFileSync(expectedPath, 'utf8').split('\n').filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(`expected exactly one appended line, got ${lines.length}`);
  }
  const envelope: unknown = JSON.parse(lines[0] ?? '');
  if (!isRecord(envelope)) {
    throw new TypeError(`expected the appended line to be a JSON object, got: ${lines[0]}`);
  }
  if (envelope.id !== result.id) {
    throw new Error(`expected the appended id to match the reported one, got ${JSON.stringify(envelope.id)}`);
  }
  const expectedFields: Record<string, unknown> = {
    type: 'skill.started',
    repo: 'williamthorsen/codeassembly',
    branch: '986/smoke',
    session: 'smoke-session',
    harness: 'claude',
  };
  for (const [field, expected] of Object.entries(expectedFields)) {
    if (envelope[field] !== expected) {
      throw new Error(`expected ${field} ${JSON.stringify(expected)}, got ${JSON.stringify(envelope[field])}`);
    }
  }
  // `cwd` is the realpath of the fixture repo: macOS resolves the `/var` temp dir to `/private/var`, so compare on the
  // basename rather than the raw `mkdtemp` path.
  if (typeof envelope.cwd !== 'string' || !envelope.cwd.endsWith(path.basename(repo))) {
    throw new Error(`expected cwd to name the fixture repo, got ${JSON.stringify(envelope.cwd)}`);
  }
  if (!isRecord(envelope.payload) || envelope.payload.skill !== 'emit-event') {
    throw new Error(`expected the supplied payload, got ${JSON.stringify(envelope.payload)}`);
  }
}

/**
 * Type guard: Narrows `value` to a plain object with unknown property values.
 *
 * Kept local rather than imported from `src/lib/type-guards.ts`: these smoke-test utilities sit outside the runtime
 * surface, and importing runtime source here would couple the two for the sake of a one-line guard.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
