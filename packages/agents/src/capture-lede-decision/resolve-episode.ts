import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { readNoteContent } from '@codeassembly/kb/note-io';

import { extractString } from '../kb-shared/note-helpers.ts';
import { isEnoent, isRecord } from '../lib/type-guards.ts';
import type { EpisodeIdentity, ResolveEpisodeOutcome } from './types.ts';

/** Artifact filename suffix holding the lede the agent published, and the heading that lede sits under. */
const AGENT_LEDE_SOURCE = { suffix: '_pull-request', heading: 'What' } as const;

/** Artifact filename suffix holding the lede that merged, and the heading it sits under. */
const MERGED_LEDE_SOURCE = { suffix: '_merge', heading: 'Body' } as const;

/**
 * Assembles a lede decision episode from a ticket's artifact directory: the lede the agent published, the lede that
 * merged, the change's identity, and a fingerprint of the doctrine that governed the agent's text.
 *
 * Each lede accepts an override file, so a pull request merged outside the merge flow — which writes no `_merge.md` —
 * can still be recorded from text the caller fetched. Absent an override, each is read from the newest artifact of its
 * kind, searched recursively because an orchestrated run nests its artifacts in a run subdirectory. Artifact filenames
 * open with a `YYYYMMDDD-HHMMSSZ` stamp, so the lexicographically greatest basename is the newest.
 *
 * The doctrine is fingerprinted by content rather than recorded as a version, which is what lets records group by
 * doctrine generation with nothing written at install time: the mapping back to a commit stays recoverable afterwards
 * by re-hashing the file's own history.
 */
export async function resolveEpisode(input: {
  artifactDir: string;
  /** Directory holding `lede-voice.md` and `work-types.json`; the `_data` sibling of the installed helper. */
  dataDir: string;
  pr: string;
  mergeCommit: string;
  type?: string;
  scope?: string;
  ticket?: string;
  agentLedeFile?: string;
  mergedLedeFile?: string;
  /** Install manifest supplying the agents-package version; defaults to the user-global manifest. */
  manifestPath?: string;
  /** Home directory the user-global manifest path resolves against; defaults to the real home. */
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

  const mergedLede = await readLede({
    artifactDir: input.artifactDir,
    source: MERGED_LEDE_SOURCE,
    ...(input.mergedLedeFile !== undefined && { overrideFile: input.mergedLedeFile }),
  });
  if (mergedLede === null) {
    return {
      ok: false,
      error: 'no-merged-lede',
      message: `no "## ${MERGED_LEDE_SOURCE.heading}" section in a ${MERGED_LEDE_SOURCE.suffix}.md artifact under ${input.artifactDir}`,
    };
  }

  const doctrinePath = path.join(input.dataDir, 'lede-voice.md');
  const doctrineHash = await hashFile(doctrinePath);
  if (doctrineHash === null) {
    return { ok: false, error: 'no-doctrine', message: `doctrine file not readable: ${doctrinePath}` };
  }

  const identity = await resolveIdentity(input);
  if (!identity.ok) {
    return identity;
  }

  const agentsVersion = await readAgentsVersion({ manifestPath: input.manifestPath, home: input.home });

  return {
    ok: true,
    episode: {
      agentLede,
      mergedLede,
      differ: normalizeLede(agentLede) !== normalizeLede(mergedLede),
      identity: identity.identity,
      doctrineHash,
      ...(agentsVersion !== null && { agentsVersion }),
    },
  };
}

/**
 * Reads a named `## ` section from Markdown: everything between the heading and the next `## ` heading or the end of
 * the document, trimmed. Yields `null` when the heading is absent or its section is empty.
 *
 * Matching is line-based and case-insensitive on the heading text. The artifacts this reads carry no frontmatter, so
 * their heading structure is the only handle on their content.
 */
export function extractSection(input: { text: string; heading: string }): string | null {
  const lines = input.text.split('\n');
  const target = input.heading.trim().toLowerCase();
  let start = -1;

  for (const [index, line] of lines.entries()) {
    if (start === -1) {
      if (line.startsWith('## ') && line.slice(3).trim().toLowerCase() === target) {
        start = index + 1;
      }
      continue;
    }
    if (line.startsWith('## ')) {
      return joinSection(lines.slice(start, index));
    }
  }

  return start === -1 ? null : joinSection(lines.slice(start));
}

// region | Helpers

/**
 * Locates the newest artifact whose basename ends with `{suffix}.md`, searching recursively so a run subdirectory's
 * artifact competes with the ticket root's. Yields `null` when none exists.
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

/** Computes a `sha256:`-prefixed digest of a file's bytes; `null` when the file cannot be read. */
async function hashFile(filePath: string): Promise<string | null> {
  const content = await readFileSafely(filePath);
  return content === null ? null : `sha256:${createHash('sha256').update(content).digest('hex')}`;
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

/** Joins section lines and trims them, yielding `null` for a section that holds no text. */
function joinSection(lines: readonly string[]): string | null {
  const section = lines.join('\n').trim();
  return section.length > 0 ? section : null;
}

/** Collapses runs of whitespace so two ledes differing only by reflow compare equal. */
function normalizeLede(value: string): string {
  return value.replaceAll(/\s+/gu, ' ').trim();
}

/** Reads the installed agents-package version from the install manifest; `null` when it is absent or unreadable. */
async function readAgentsVersion(input: {
  manifestPath: string | undefined;
  home: string | undefined;
}): Promise<string | null> {
  const resolved = input.manifestPath ?? path.join(input.home ?? homedir(), '.codeassembly', 'agents-manifest.json');
  const content = await readFileSafely(resolved);
  if (content === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.shared)) {
    return null;
  }
  return typeof parsed.shared.version === 'string' ? parsed.shared.version : null;
}

/**
 * Reads `type`, `scope`, and `ticket_id` from the newest change-summary artifact's frontmatter; each may be `null`.
 * The read is field-blind rather than routed through the knowledge base's record parser: a change summary is an
 * artifact, not a knowledge-base record, and imposing that schema on it would reject the whole block over fields an
 * artifact never carries.
 */
async function readChangeSummaryFields(
  artifactDir: string,
): Promise<{ type: string | null; scope: string | null; ticket: string | null }> {
  const absent = { type: null, scope: null, ticket: null };

  const artifactPath = await findNewestArtifact({ artifactDir, suffix: '_change-summary' });
  if (artifactPath === null) {
    return absent;
  }
  const content = await readFileSafely(artifactPath);
  if (content === null) {
    return absent;
  }

  const { fields } = readNoteContent(content);
  return {
    type: extractString(fields, 'type'),
    scope: extractString(fields, 'scope'),
    ticket: readIdentifier(fields, 'ticket_id'),
  };
}

/**
 * Reads an identifier field that YAML may have typed as a number: a wholly numeric ticket id is written unquoted, so a
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
    const override = await readFileSafely(input.overrideFile);
    return override === null ? null : joinSection([override]);
  }

  const artifactPath = await findNewestArtifact({ artifactDir: input.artifactDir, suffix: input.source.suffix });
  if (artifactPath === null) {
    return null;
  }
  const text = await readFileSafely(artifactPath);
  return text === null ? null : extractSection({ text, heading: input.source.heading });
}

/**
 * Resolves the change's identity, preferring the caller's flags and falling back to the newest change-summary
 * artifact's frontmatter, which is the only artifact in the chain that carries typed fields. The tier derives from the
 * work type through the installed taxonomy rather than being passed in, so it always reflects the taxonomy in force.
 */
async function resolveIdentity(input: {
  artifactDir: string;
  dataDir: string;
  pr: string;
  mergeCommit: string;
  type?: string;
  scope?: string;
  ticket?: string;
}): Promise<{ ok: true; identity: EpisodeIdentity } | { ok: false; error: 'unresolved-identity'; message: string }> {
  const fallback = await readChangeSummaryFields(input.artifactDir);

  const type = input.type ?? fallback.type;
  if (type === null) {
    return { ok: false, error: 'unresolved-identity', message: 'work type could not be resolved; pass --type' };
  }

  const scope = input.scope ?? fallback.scope;
  if (scope === null) {
    return { ok: false, error: 'unresolved-identity', message: 'scope could not be resolved; pass --scope' };
  }

  const tier = await resolveTier({ dataDir: input.dataDir, type });
  if (tier === null) {
    return {
      ok: false,
      error: 'unresolved-identity',
      message: `work type "${type}" is not declared in work-types.json, so its tier cannot be resolved`,
    };
  }

  const ticket = input.ticket ?? fallback.ticket;

  return {
    ok: true,
    identity: {
      type,
      tier,
      scope,
      pr: input.pr,
      mergeCommit: input.mergeCommit,
      ...(ticket !== null && { ticket }),
    },
  };
}

/**
 * Looks up a work type's tier in the installed taxonomy, matching the canonical key or any declared alias; `null` when
 * the taxonomy is unreadable or declares no such type.
 */
async function resolveTier(input: { dataDir: string; type: string }): Promise<string | null> {
  const content = await readFileSafely(path.join(input.dataDir, 'work-types.json'));
  if (content === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.types)) {
    return null;
  }

  for (const entry of parsed.types) {
    if (!isRecord(entry) || typeof entry.tier !== 'string') {
      continue;
    }
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    if (entry.key === input.type || aliases.includes(input.type)) {
      return entry.tier;
    }
  }
  return null;
}

// endregion | Helpers
