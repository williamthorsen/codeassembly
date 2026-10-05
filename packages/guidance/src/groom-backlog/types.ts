/** Shared types of the backlog-grooming helper. */
import type { AssessmentRecord, AssessorReply, Marker } from './schemas.ts';

/** Runs `command` with `args` in `cwd` and resolves to its stdout; rejects when the command fails. */
export type CommandRunner = (command: 'gh' | 'git', args: readonly string[], cwd: string) => Promise<string>;

/** One comment on a fetched issue. */
export interface IssueComment {
  author: string;
  body: string;
  createdAt: string;
}

/** An issue as the helper reads it from GitHub, with each relation reduced to issue numbers. */
export interface Issue {
  assignees: string[];
  /** The issues that block this one, open or closed. */
  blockedBy: number[];
  body: string;
  closedAt: string | null;
  comments: IssueComment[];
  createdAt: string;
  labels: string[];
  milestone: { dueOn: string | null; title: string } | null;
  number: number;
  parent: number | null;
  state: 'closed' | 'open';
  subIssues: { completed: number; total: number };
  title: string;
  updatedAt: string;
  url: string;
}

/** Where a sign of ongoing work on a ticket was found. */
export type InProgressSignal = 'branch' | 'manifest' | 'remote-branch';

/** A sign that someone is working on a ticket, with the state of the branch that shows it. */
export interface InProgress {
  commitsAhead: number;
  lastCommitAt: string;
  ref: string;
  signal: InProgressSignal;
}

/** How a cross-reference candidate names a ticket. */
export type CrossReferenceKind = 'closing-pr' | 'commit-mention' | 'pr-mention';

/** A merged pull request or a default-branch commit that may do a ticket's work. */
export interface CrossReference {
  date: string;
  kind: CrossReferenceKind;
  ref: string;
  title: string;
}

/** The per-ticket input file that `collect` writes for the assessor. */
export interface TicketInput {
  body: string;
  comments: IssueComment[];
  createdAt: string;
  crossReferences: CrossReference[];
  inProgress: InProgress | null;
  labels: string[];
  number: number;
  priorMarker: Marker | null;
  title: string;
  updatedAt: string;
  url: string;
}

/** The selectors that narrow the fetched backlog. */
export interface Selectors {
  excludeLabels: string[];
  limit: number | undefined;
  olderThanDays: number | undefined;
  scopes: string[];
}

/** The tickets of one scope label, oldest first, packed into dispatch waves. */
export interface TicketGroup {
  scope: string | null;
  tickets: Array<{ inProgress: InProgress | null; number: number; title: string; updatedAt: string }>;
  waves: number[][];
}

/** An escalated ticket as the digest renders it. */
export interface Escalation {
  record: AssessmentRecord;
  reply: AssessorReply | undefined;
}
