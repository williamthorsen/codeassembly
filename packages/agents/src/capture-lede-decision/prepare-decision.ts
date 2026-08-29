import { readNoteContent, renderNote } from '@williamthorsen/kb/note-io';
import { type KbEvent, parseEvent, renderEvent } from '@williamthorsen/kb/records';

import type { LedeQuality } from '../lede-corpus/lede-quality.ts';
import {
  AGENT_LEDE_HEADING,
  COMMENT_HEADING,
  LEDE_DECISION_TAG,
  MERGED_LEDE_HEADING,
} from '../lede-corpus/lede-sections.ts';
import type { LedeEpisode, LedeVerdict } from './types.ts';

/** A prepared decision ready to write: its ULID-keyed filename stem and the full rendered note content. */
export interface PreparedDecision {
  /** The decision's ULID, also the filename stem. */
  id: string;
  /** ISO-8601 capture timestamp. */
  capturedAt: string;
  /** The verdict derived for this decision, reported so a caller states the same one the record carries. */
  verdict: LedeVerdict;
  /** The full note content (frontmatter fence plus body) to write. */
  content: string;
}

/** The outcome of preparing a decision for write: the rendered note, or the errors that blocked it. */
export type PrepareDecisionOutcome = { ok: true; prepared: PreparedDecision } | { ok: false; errors: string[] };

/**
 * Composes a lede decision as a knowledge-base `event`, renders it through the record module's `renderEvent`, and
 * validates the serialized note by re-parsing it. A decision is a third consumer of the event substrate rather than a
 * record type of its own, so it carries the same typed spine every captured event does and rides its change identity,
 * doctrine fingerprint, and provenance in `extra`.
 *
 * Tags carry the group (`lede-decision`), the work type under a `type:` namespace, the verdict, and the rating under a
 * `quality:` namespace. The namespaces are what keep a work type or a rating from colliding with the topical tags an
 * event already uses — a bare `fix` already means a solved-problem episode.
 *
 * The verdict is derived from whether the two ledes differ, which is also what decides whether the body carries a
 * merged section. One derivation drives both, so the verdict and the sections can never describe different episodes.
 */
export function prepareDecision(input: {
  episode: LedeEpisode;
  quality: LedeQuality;
  comment: string;
  context: { cwd: string; session?: string; repo?: string };
  harness: string | null;
  id: string;
  capturedAt: string;
}): PrepareDecisionOutcome {
  const { episode, quality, context, harness, id, capturedAt } = input;
  const { identity } = episode;
  const verdict: LedeVerdict = episode.differ ? 'revised' : 'accepted';

  const extra: Record<string, unknown> = {
    quality,
    type: identity.type,
    tier: identity.tier,
    scope: identity.scope,
    pr: identity.pr,
    'merge-commit': identity.mergeCommit,
    ...(identity.ticket !== undefined && { ticket: identity.ticket }),
    'doctrine-hash': episode.doctrineHash,
    ...(episode.agentsVersion !== undefined && { 'agents-version': episode.agentsVersion }),
    ...(context.repo !== undefined && { repo: context.repo }),
    ...(harness !== null && { harness }),
  };

  const record: KbEvent = {
    recordType: 'event',
    id,
    capturedAt,
    ...(context.session !== undefined && { session: context.session }),
    cwd: context.cwd,
    summary: `Lede ${verdict} for ${identity.scope} #${identity.pr}, rated ${quality}`,
    tags: [LEDE_DECISION_TAG, `type:${identity.type}`, verdict, `quality:${quality}`],
    addressedBy: [],
    extra,
    body: composeBody({ episode, comment: input.comment }),
  };

  const rendered = renderEvent(record);
  const content = renderNote(rendered.fields, rendered.body);

  const errors = validate(content);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, prepared: { id, capturedAt, verdict, content } };
}

// region | Helpers

/** Renders the decision body: the agent's lede, the merged lede when it differs, and the comment when one was given. */
function composeBody(input: { episode: LedeEpisode; comment: string }): string {
  const sections = [`## ${AGENT_LEDE_HEADING}\n\n${input.episode.agentLede}`];
  if (input.episode.differ) {
    sections.push(`## ${MERGED_LEDE_HEADING}\n\n${input.episode.mergedLede}`);
  }
  const comment = input.comment.trim();
  if (comment.length > 0) {
    sections.push(`## ${COMMENT_HEADING}\n\n${comment}`);
  }
  return `${sections.join('\n\n')}\n`;
}

/** Re-parses the rendered note and validates it as an `event` record, returning any validation errors. */
function validate(content: string): string[] {
  const { fields, body } = readNoteContent(content);
  const result = parseEvent(fields, body);
  return result.ok ? [] : result.errors;
}

// endregion | Helpers
