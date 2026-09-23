import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { readNoteContent } from '@williamthorsen/kb/note-io';

import { applyOverrides } from '../change-grammar/apply-overrides.ts';
import { normalizeChangeRecord } from '../change-grammar/tokens.ts';
import type { ChangeRecord } from '../change-grammar/types.ts';
import { stripChangeRecordBlocks } from '../describe-change/change-record-block.ts';
import { extractString } from '../kb-shared/note-helpers.ts';
import { readHomeProvenance, readHomeProvenanceAt } from '../lib/home-provenance.ts';
import { extractSection } from '../lib/markdown-sections.ts';
import { isEnoent } from '../lib/type-guards.ts';
import { loadWorkTypes, resolveWorkType } from '../lib/work-types.ts';
import type { EpisodeIdentity, ResolveEpisodeOutcome } from './types.ts';

/** Artifact filename suffix holding the lede published by the agent, and the heading under which that lede appears. */
const AGENT_LEDE_SOURCE = { suffix: '_pull-request', heading: 'What' } as const;

/**
 * Subagent bodies that govern a draft, in the fixed order on which the combined digest depends. The drafter writes the
 * lede and the entries both, so its body is the whole doctrine under which a lede was written.
 */
const DOCTRINE_FILENAMES: ReadonlyArray<string> = ['entry-drafter.md'];

/**
 * Artifact filename suffix holding the body that merged, and the heading under which it appears. The section records
 * the published whole, so the lede is what remains without the entry records below it.
 */
const MERGED_LEDE_SOURCE = { suffix: '_merge', heading: 'Body' } as const;

/** Result of digesting the doctrine: the combined fingerprint, or the first body that could not be read. */
type DoctrineHashOutcome = { ok: true; hash: string } | { ok: false; unreadablePath: string };

/**
 * Assembles a lede decision episode from a ticket's artifact directory: the lede published by the agent, the lede that
 * merged, the change's identity, and a fingerprint of the doctrine that governed the agent's text.
 *
 * Each lede accepts an override file, so a pull request merged outside the merge flow (which writes no `_merge.md`)
 * can still be recorded from text fetched by the caller. Absent an override, each is read from the newest artifact of
 * its kind, searched recursively because an orchestrated run nests its artifacts in a run subdirectory. Artifact
 * filenames open with a `YYYYMMDDD-HHMMSSZ` stamp. The lexicographically greatest basename is the newest.
 *
 * The doctrine is fingerprinted by content rather than recorded as a version, which lets records group by doctrine
 * generation with nothing written at install time: The mapping back to a commit stays recoverable afterwards by
 * re-hashing the file's own history.
 */
export async function resolveEpisode(input: {
  artifactDir: string;
  /** Directory holding `work-types.json`; the `_data` sibling of the installed helper. */
  dataDir: string;
  /** Directory holding the deployed subagent bodies that govern a draft; the harness's `agents` or `subagents` dir. */
  subagentsDir: string;
  pr: string;
  mergeCommit: string;
  type?: string;
  scope?: string;
  /** Whether `--breaking` was passed; `true` makes the flags the identity's source, as `--type` and `--scope` do. */
  breaking?: boolean;
  ticket?: string;
  agentLedeFile?: string;
  mergedLedeFile?: string;
  /** Provenance stamp supplying the agents-package version; defaults to the user-global stamp. */
  provenancePath?: string;
  /** Home directory against which the user-global stamp path resolves; defaults to the real home. */
  home?: string;
}): Promise<ResolveEpisodeOutcome> {
  if (!(await isDirectory(input.artifactDir))) {
    return { ok: false, error: 'no-artifact-dir', message: `artifact directory not found: ${input.artifactDir}` };
  }

  const agentLede = await readLede({
    artifactDir: input.artifactDir,
    source: AGENT_LEDE_SOURCE,
    ...(input.agentLedeFile !== undefined && { overrideFile: input.agentLedeFile }),
  });
  if (agentLede === null) {
    return {
      ok: false,
      error: 'no-agent-lede',
      message: `no "## ${AGENT_LEDE_SOURCE.heading}" section in a ${AGENT_LEDE_SOURCE.suffix}.md artifact under ${input.artifactDir}`,
    };
  }

  const mergedBody = await readLede({
    artifactDir: input.artifactDir,
    source: MERGED_LEDE_SOURCE,
    ...(input.mergedLedeFile !== undefined && { overrideFile: input.mergedLedeFile }),
  });
  if (mergedBody === null) {
    return {
      ok: false,
      error: 'no-merged-lede',
      message: `no "## ${MERGED_LEDE_SOURCE.heading}" section in a ${MERGED_LEDE_SOURCE.suffix}.md artifact under ${input.artifactDir}`,
    };
  }
  const mergedLede = stripChangeTrailers(stripChangeRecordBlocks(mergedBody).trimEnd());

  const doctrine = await hashDoctrine(input.subagentsDir);
  if (!doctrine.ok) {
    return { ok: false, error: 'no-doctrine', message: `doctrine file not readable: ${doctrine.unreadablePath}` };
  }

  const identity = await resolveIdentity(input);
  if (!identity.ok) {
    return identity;
  }

  const agentsVersion = await readAgentsVersion({ provenancePath: input.provenancePath, home: input.home });

  return {
    ok: true,
    episode: {
      agentLede,
      mergedLede,
      differ: normalizeLede(agentLede) !== normalizeLede(mergedLede),
      identity: identity.identity,
      doctrineHash: doctrine.hash,
      ...(agentsVersion !== null && { agentsVersion }),
    },
  };
}

// region | Helpers

/**
 * Locates the newest artifact whose basename ends with `{suffix}.md`, searching recursively so that a run
 * subdirectory's artifact competes with the ticket root's. Yields `null` when none exists.
 */
async function findNewestArtifact(input: { artifactDir: string; suffix: string }): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(input.artifactDir, { recursive: true });
  } catch (error) {
    if (isEnoent(error)) {
      return null;
    }
    throw error;
  }

  let newest: { basename: string; relativePath: string } | null = null;
  for (const relativePath of entries) {
    const basename = path.basename(relativePath);
    if (!basename.endsWith(`${input.suffix}.md`)) {
      continue;
    }
    if (newest === null || basename > newest.basename) {
      newest = { basename, relativePath };
    }
  }

  return newest === null ? null : path.join(input.artifactDir, newest.relativePath);
}

/**
 * Digests the subagent bodies that govern a draft. Each body is hashed on its own and the digests are hashed
 * together, so a change to any of them moves the result and no content can straddle the boundary between two.
 */
async function hashDoctrine(subagentsDir: string): Promise<DoctrineHashOutcome> {
  const digests: string[] = [];
  for (const filename of DOCTRINE_FILENAMES) {
    const filePath = path.join(subagentsDir, filename);
    const content = await readFileSafely(filePath);
    if (content === null) {
      return { ok: false, unreadablePath: filePath };
    }
    digests.push(createHash('sha256').update(content).digest('hex'));
  }
  return { ok: true, hash: `sha256:${createHash('sha256').update(digests.join('\n')).digest('hex')}` };
}

/** Reports whether a path exists and is a directory. */
async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    return (await stat(dirPath)).isDirectory();
  } catch (error) {
    if (isEnoent(error)) {
      return false;
    }
    throw error;
  }
}

/** Matches one `Change:` trailer line, on the key that Git matches case-insensitively. */
const CHANGE_TRAILER = /^change:[ \t]/iu;

/** Collapses runs of whitespace so that two ledes differing only by reflow compare equal. */
function normalizeLede(value: string): string {
  return value.replaceAll(/\s+/gu, ' ').trim();
}

/**
 * Reads the installed agents-package version from the home-provenance stamp, which records the version of the package
 * whose binary last wrote the home domain; `null` when no readable stamp is there.
 */
async function readAgentsVersion(input: {
  provenancePath: string | undefined;
  home: string | undefined;
}): Promise<string | null> {
  const provenance =
    input.provenancePath === undefined
      ? await readHomeProvenance(input.home)
      : await readHomeProvenanceAt(input.provenancePath);
  return provenance?.lastWrite?.version ?? null;
}

/**
 * Reads the effective record and the `ticket_id` from the newest change-summary artifact's frontmatter: the consolidated
 * record's `scope`, `type`, and `breaking`, with `override_scope`, `override_type`, and `override_breaking` applied
 * through `applyOverrides`. The resolver reads the marker from a type spelled with `!`.
 *
 * The read is field-blind rather than routed through the knowledge base's record parser: A change summary is an
 * artifact, not a knowledge-base record, and imposing that schema on it would reject the whole block over fields that
 * an artifact never declares.
 */
async function readChangeSummaryFields(artifactDir: string): Promise<{ record: ChangeRecord; ticket: string | null }> {
  const absent = { record: {}, ticket: null };

  const artifactPath = await findNewestArtifact({ artifactDir, suffix: '_change-summary' });
  if (artifactPath === null) {
    return absent;
  }
  const content = await readFileSafely(artifactPath);
  if (content === null) {
    return absent;
  }

  const { fields } = readNoteContent(content);
  const scope = extractString(fields, 'scope');
  const type = extractString(fields, 'type');
  const overrideScope = extractString(fields, 'override_scope');
  const overrideType = extractString(fields, 'override_type');
  const consolidatedRecord = normalizeChangeRecord({
    ...(fields.breaking === true && { breaking: true }),
    ...(scope !== null && { scope }),
    ...(type !== null && { type }),
  });
  const record = applyOverrides(consolidatedRecord, {
    ...(fields.override_breaking === true && { breaking: true }),
    ...(overrideScope !== null && { scope: overrideScope }),
    ...(overrideType !== null && { type: overrideType }),
  });
  return { record, ticket: readIdentifier(fields, 'ticket_id') };
}

/**
 * Reads an identifier field that YAML may have typed as a number: A wholly numeric ticket id is written unquoted, so a
 * string-only read would silently drop it, while a prefixed key such as `MAC-42` arrives as a string.
 */
function readIdentifier(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return extractString(fields, key);
}

/** Reads a file as UTF-8, yielding `null` when it does not exist. */
async function readFileSafely(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Reads one lede: the override file's whole contents when given, otherwise the named section of the newest artifact of
 * its kind. Yields `null` when neither yields text.
 */
async function readLede(input: {
  artifactDir: string;
  source: { suffix: string; heading: string };
  overrideFile?: string;
}): Promise<string | null> {
  if (input.overrideFile !== undefined) {
    const override = (await readFileSafely(input.overrideFile))?.trim();
    return override === undefined || override.length === 0 ? null : override;
  }

  const artifactPath = await findNewestArtifact({ artifactDir: input.artifactDir, suffix: input.source.suffix });
  if (artifactPath === null) {
    return null;
  }
  const text = await readFileSafely(artifactPath);
  return text === null ? null : extractSection({ text, heading: input.source.heading });
}

/**
 * Resolves the change's identity from one source: the caller's `--type`, `--scope`, and `--breaking` when any of them
 * is passed, and otherwise the newest change-summary artifact's frontmatter, which is the only artifact in the chain
 * that has typed fields. One identity never combines fields from both, so a caller passing a type for a change that
 * names no scope records no scope. The ticket falls back to the change summary on its own, being no part of the
 * consolidated record. A scope of `*` from either source names no scope.
 *
 * Because the work type is resolved through the installed taxonomy rather than taken as spelled, the identity records
 * the canonical key and the tier that the taxonomy in force declares for it. A type spelled with `!` marks the change
 * breaking, as `--breaking` does.
 *
 * A taxonomy that does not load is reported apart from a type that it does not declare. The two conditions look alike
 * at the failed lookup and differ in the caller's recourse: One is repaired by passing a flag, the other only by
 * repairing the install.
 */
async function resolveIdentity(input: {
  artifactDir: string;
  dataDir: string;
  pr: string;
  mergeCommit: string;
  type?: string;
  scope?: string;
  breaking?: boolean;
  ticket?: string;
}): Promise<
  { ok: true; identity: EpisodeIdentity } | { ok: false; error: 'no-taxonomy' | 'unresolved-identity'; message: string }
> {
  const summary = await readChangeSummaryFields(input.artifactDir);
  const fromFlags = input.type !== undefined || input.scope !== undefined || input.breaking === true;
  const source = fromFlags
    ? normalizeChangeRecord({
        ...(input.breaking === true && { breaking: true }),
        ...(input.scope !== undefined && { scope: input.scope }),
        ...(input.type !== undefined && { type: input.type }),
      })
    : summary.record;

  const type = source.type;
  if (type === undefined) {
    return {
      ok: false,
      error: 'unresolved-identity',
      message: fromFlags
        ? 'work type is missing; pass --type with --scope or --breaking, since the identity then comes from the flags alone'
        : 'work type could not be resolved; pass --type',
    };
  }

  const workTypes = await loadWorkTypes(input.dataDir);
  if (workTypes === null) {
    return {
      ok: false,
      error: 'no-taxonomy',
      message: `no readable work-types.json under ${input.dataDir}`,
    };
  }

  const resolved = resolveWorkType(type, workTypes);
  if (resolved === null) {
    return {
      ok: false,
      error: 'unresolved-identity',
      message: `work type "${type}" is not declared in work-types.json, so its tier cannot be resolved`,
    };
  }

  const ticket = input.ticket ?? summary.ticket;

  return {
    ok: true,
    identity: {
      type: resolved.workType.key,
      tier: resolved.workType.tier,
      breaking: resolved.breaking || source.breaking === true,
      ...(source.scope !== undefined && { scope: source.scope }),
      pr: input.pr,
      mergeCommit: input.mergeCommit,
      ...(ticket !== null && { ticket }),
    },
  };
}

/**
 * Removes the trailing `Change:` trailer block from a merge commit's body, leaving the lede that stands above it.
 *
 * Only a run at the end qualifies, and only when every line of it is a trailer: a body whose last paragraph is prose
 * keeps every line, and one that is trailers alone leaves nothing. A body containing no trailer block is returned
 * whole.
 */
function stripChangeTrailers(body: string): string {
  const lines = body.split('\n');
  let end = lines.length;
  while (end > 0 && (lines[end - 1] ?? '').trim() === '') {
    end -= 1;
  }
  const beforeTrailers = end;
  while (end > 0 && CHANGE_TRAILER.test(lines[end - 1] ?? '')) {
    end -= 1;
  }
  return end === beforeTrailers ? body : lines.slice(0, end).join('\n').trimEnd();
}

// endregion | Helpers
