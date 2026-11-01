/** The triage record: its shape, the rules that span its fields, and the order in which its clusters are surfaced. */
import { EVENT_IMPACT_LEVELS } from '@williamthorsen/kb/records';
import { z } from 'zod';

import { parseTriageReferenceDate } from '../lesson-clusters/deferral.ts';

export const PRIORITIES = ['high', 'medium', 'low'] as const;

const Priority = z.enum(PRIORITIES);
const Count = z.number().int().nonnegative();
const RepoSlug = z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'must be owner/name');

const SignalsSchema = z.object({
  recurrence: z.number().int().positive(),
  impact: z.object({ critical: Count, high: Count, medium: Count, low: Count, unrated: Count }),
  firstCapturedAt: z.string().min(1),
  latestCapturedAt: z.string().min(1),
  status: z.literal('eligible'),
});

const ChallengeSchema = z.object({
  argument: z.string(),
  outcome: z.enum(['defended', 'modified', 'abandoned', 'not-returned']),
  originalPriority: Priority.exactOptional(),
  note: z.string(),
});

const SuggestionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ticket-existing'), target: z.string().min(1), repo: RepoSlug }),
  z.object({ kind: z.literal('ticket-new'), target: z.string().min(1), repo: RepoSlug }),
  z.object({ kind: z.literal('ticket-undecided'), target: z.null(), repo: RepoSlug }),
  z.object({ kind: z.literal('comment'), issue: z.url() }),
  z.object({ kind: z.literal('impact'), level: z.enum(EVENT_IMPACT_LEVELS) }),
  z.object({ kind: z.literal('defer') }),
]);

const ResultSchema = z
  .object({
    ticket: z.url().exactOptional(),
    comment: z.url().exactOptional(),
    marked: z.boolean(),
  })
  .nullable();

const ClusterSchema = z.object({
  id: z.string().min(1),
  lesson: z.string().min(1),
  eventIds: z.array(z.string().min(1)).min(1),
  signals: SignalsSchema,
  priority: Priority,
  reason: z.string().min(1),
  challenge: ChallengeSchema,
  surfaced: z.boolean(),
  suggested: SuggestionSchema.exactOptional(),
  originalSuggested: SuggestionSchema.exactOptional(),
  decision: z.enum(['approved', 'declined', 'modified']).exactOptional(),
  result: ResultSchema.exactOptional(),
});

/** The shape of the triage record that the skill keeps in its work directory. */
export const RecordSchema = z.object({
  store: z.string().min(1),
  limit: z.number().int().positive(),
  artifactPath: z.string().min(1),
  clusters: z.array(ClusterSchema),
  unranked: z.object({ clusters: Count, events: Count }),
  remainder: z.object({ clusters: Count, events: Count, excluded: Count }),
});

export type TriageRecord = z.infer<typeof RecordSchema>;
export type Cluster = z.infer<typeof ClusterSchema>;
export type Suggestion = z.infer<typeof SuggestionSchema>;

/** A breach of a rule that spans the record's fields, naming the cluster when one is at fault. */
export interface RuleViolation {
  cluster: string | null;
  message: string;
}

const PRIORITY_RANK: Record<Cluster['priority'], number> = { high: 0, medium: 1, low: 2 };

/** Returns the clusters in surfacing order: priority, then recurrence, then latest capture, newest first. */
export function orderClusters(clusters: readonly Cluster[]): Cluster[] {
  return clusters.toSorted(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      b.signals.recurrence - a.signals.recurrence ||
      b.signals.latestCapturedAt.localeCompare(a.signals.latestCapturedAt) ||
      a.id.localeCompare(b.id),
  );
}

/** Reports whether a disposition files a ticket. */
export function isTicketKind(suggestion: Suggestion): suggestion is Extract<Suggestion, { target: unknown }> {
  return 'target' in suggestion;
}

/** Returns the ids of the approved or modified clusters whose disposition has not been fully written. */
export function findPending(record: TriageRecord): string[] {
  return record.clusters
    .filter((cluster) => cluster.surfaced && cluster.decision !== undefined && cluster.decision !== 'declined')
    .filter((cluster) => cluster.result?.marked !== true)
    .map((cluster) => cluster.id);
}

/** Checks the rules that span the record's fields and returns every violation. */
export function checkRules(record: TriageRecord): RuleViolation[] {
  const violations: RuleViolation[] = [];
  function add(cluster: string | null, message: string): void {
    violations.push({ cluster, message });
  }

  if (parseTriageReferenceDate(record.artifactPath) === null) {
    add(null, 'artifactPath must name a {YYYYMMDD-HHMMSS}Z_{slug}_feedback-triage.md file');
  }

  const clusterIds = new Set<string>();
  const eventOwners = new Map<string, string>();
  for (const cluster of record.clusters) {
    if (clusterIds.has(cluster.id)) add(cluster.id, 'the cluster id is used more than once');
    clusterIds.add(cluster.id);
    for (const eventId of cluster.eventIds) {
      const owner = eventOwners.get(eventId);
      if (owner === undefined) eventOwners.set(eventId, cluster.id);
      else add(cluster.id, `event "${eventId}" is also in cluster "${owner}"`);
    }
    for (const message of [...checkChallenge(cluster), ...checkDisposition(cluster)]) add(cluster.id, message);
  }

  checkSurfacing(record, add);
  return violations;
}

// region | Helpers

/** Checks that the challenge records a replaced priority only when it changed the priority, and only when it differs. */
function checkChallenge(cluster: Cluster): string[] {
  const { challenge } = cluster;
  if (challenge.outcome !== 'modified' && challenge.outcome !== 'abandoned') {
    return challenge.originalPriority === undefined
      ? []
      : [`originalPriority is set, but the challenge outcome is ${challenge.outcome}`];
  }
  if (challenge.originalPriority === cluster.priority) return ['originalPriority must differ from the final priority'];
  return [];
}

/** Checks that only a surfaced cluster has a disposition, and that its result fits its decision and kind. */
function checkDisposition(cluster: Cluster): string[] {
  const messages: string[] = [];
  if (!cluster.surfaced) {
    for (const field of ['suggested', 'originalSuggested', 'decision', 'result'] as const) {
      if (cluster[field] !== undefined) messages.push(`a cluster that is not surfaced must not have ${field}`);
    }
    return messages;
  }

  if (cluster.suggested === undefined) messages.push('a surfaced cluster must have suggested');
  if (cluster.decision === 'modified' && cluster.originalSuggested === undefined) {
    messages.push('a modified decision must record originalSuggested');
  }
  if (cluster.decision !== 'modified' && cluster.originalSuggested !== undefined) {
    messages.push('originalSuggested is set, but the decision is not modified');
  }
  if (cluster.result !== undefined && cluster.result !== null) {
    messages.push(...checkResult(cluster, cluster.result));
  }
  return messages;
}

/** Checks that a result belongs to an applied disposition and names a ticket exactly when the disposition files one. */
function checkResult(cluster: Cluster, result: NonNullable<Cluster['result']>): string[] {
  const messages: string[] = [];
  if (cluster.decision === undefined || cluster.decision === 'declined') {
    messages.push('only an approved or modified disposition may have a result');
  }
  if (cluster.suggested === undefined) return messages;
  const filesTicket = isTicketKind(cluster.suggested);
  if (result.ticket !== undefined && !filesTicket) {
    messages.push(`a ${cluster.suggested.kind} disposition must not have a ticket`);
  }
  if (result.marked && filesTicket && result.ticket === undefined) {
    messages.push('a ticket disposition cannot mark its events before the ticket exists');
  }
  if (result.comment !== undefined && cluster.suggested.kind !== 'comment') {
    messages.push(`a ${cluster.suggested.kind} disposition must not have a comment`);
  }
  if (result.marked && cluster.suggested.kind === 'comment' && result.comment === undefined) {
    messages.push('a comment disposition cannot mark its events before the comment is posted');
  }
  return messages;
}

/**
 * Checks that the surfaced clusters are the first `limit` in surfacing order, and that the remainder counts the rest
 * together with the clusters that the candidate cut left unranked.
 */
function checkSurfacing(record: TriageRecord, add: (cluster: string | null, message: string) => void): void {
  const ordered = orderClusters(record.clusters);
  const expected = Math.min(record.limit, ordered.length);
  ordered.forEach((cluster, index) => {
    if (cluster.surfaced !== index < expected) {
      add(
        cluster.id,
        cluster.surfaced
          ? `the cluster is surfaced but ranks ${index + 1} of ${ordered.length}, below the limit of ${record.limit}`
          : `the cluster ranks ${index + 1} of ${ordered.length}, within the limit of ${record.limit}, but is not surfaced`,
      );
    }
  });

  const rest = ordered.slice(expected);
  const clusters = rest.length + record.unranked.clusters;
  const events = rest.reduce((sum, cluster) => sum + cluster.eventIds.length, 0) + record.unranked.events;
  if (record.remainder.clusters !== clusters || record.remainder.events !== events) {
    add(
      null,
      `remainder must count ${clusters} clusters and ${events} events (got ${record.remainder.clusters} and ${record.remainder.events})`,
    );
  }
}

// endregion | Helpers
