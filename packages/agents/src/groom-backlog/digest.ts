/**
 * Renders a run's open escalations as digest pages. Escalations that hinge on one open ticket are kept together and,
 * when a page holds two or more of them, shown once under that ticket as a hub; overlapping tickets are merged into
 * one group with a survivor.
 */
import type { Escalation, InProgress } from './types.ts';

/** The default number of escalations per page. */
export const DEFAULT_PAGE_SIZE = 25;

/** The page sizes that `digest` accepts, inclusive. */
export const PAGE_SIZE_RANGE = { max: 30, min: 20 } as const;

/** One rendered digest page. */
export interface DigestPage {
  entries: Array<{ index: number; number: number; recommendation: string }>;
  hubs: number[];
  markdown: string;
  page: number;
}

/** A group of overlapping tickets, merged across every escalation that reports one of them. */
export interface OverlapGroup {
  reasons: string[];
  survivor: number;
  tickets: number[];
}

/** Renders `escalations` into pages of `pageSize`. `titles` names tickets that the digest mentions but that did not escalate. */
export function renderDigest(input: {
  escalations: readonly Escalation[];
  pageSize: number;
  titles: ReadonlyMap<number, string>;
}): DigestPage[] {
  const groups = mergeOverlaps(input.escalations);
  const groupOf = new Map<number, OverlapGroup>();
  for (const group of groups) for (const ticket of group.tickets) groupOf.set(ticket, group);

  /** Returns the number by which an escalation is ordered: its hub, its overlap group, or its own. */
  function clusterOf(escalation: Escalation): number {
    return escalation.record.dependsOn ?? groupOf.get(escalation.record.number)?.tickets[0] ?? escalation.record.number;
  }
  const ordered = input.escalations.toSorted(
    (a, b) => clusterOf(a) - clusterOf(b) || a.record.number - b.record.number,
  );

  const pageCount = Math.ceil(ordered.length / input.pageSize);
  const pages: DigestPage[] = [];
  for (let page = 0; page < pageCount; page += 1) {
    const members = ordered.slice(page * input.pageSize, (page + 1) * input.pageSize);
    pages.push(renderPage({ groupOf, members, page: page + 1, pageCount, titles: input.titles }));
  }
  return pages;
}

/**
 * Merges every escalation's reported overlaps by union: Two groups that share a ticket become one. The survivor is the
 * ticket named as survivor most often, the lower number on a tie.
 */
export function mergeOverlaps(escalations: readonly Escalation[]): OverlapGroup[] {
  const parent = new Map<number, number>();
  /** Returns the representative of a ticket's group. */
  function find(ticket: number): number {
    let root = ticket;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root) ?? root;
    parent.set(ticket, root);
    return root;
  }
  /** Joins the groups of two tickets under the lower representative. */
  function union(a: number, b: number): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(Math.max(rootA, rootB), Math.min(rootA, rootB));
  }

  const overlaps = escalations.flatMap((escalation) => escalation.record.overlaps ?? []);
  for (const overlap of overlaps) {
    for (const ticket of overlap.tickets) {
      if (!parent.has(ticket)) parent.set(ticket, ticket);
      union(overlap.tickets[0] ?? ticket, ticket);
    }
  }

  const byRoot = new Map<number, { overlaps: typeof overlaps; tickets: Set<number> }>();
  for (const ticket of parent.keys()) {
    const root = find(ticket);
    const entry = byRoot.get(root) ?? { overlaps: [], tickets: new Set<number>() };
    entry.tickets.add(ticket);
    byRoot.set(root, entry);
  }
  for (const overlap of overlaps) {
    const first = overlap.tickets[0];
    if (first !== undefined) byRoot.get(find(first))?.overlaps.push(overlap);
  }

  return byRoot
    .values()
    .map(({ overlaps: members, tickets }) => {
      const votes = new Map<number, number>();
      for (const overlap of members) votes.set(overlap.survivor, (votes.get(overlap.survivor) ?? 0) + 1);
      const survivor = [...votes].toSorted((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? Math.min(...tickets);
      return {
        reasons: [...new Set(members.map((overlap) => overlap.reason))],
        survivor,
        tickets: [...tickets].toSorted((a, b) => a - b),
      };
    })
    .toArray()
    .toSorted((a, b) => (a.tickets[0] ?? 0) - (b.tickets[0] ?? 0));
}

// region | Helpers

/** Formats the in-progress line of an entry. */
function describeInProgress(inProgress: InProgress): string {
  const commits = inProgress.commitsAhead === 1 ? '1 commit' : `${inProgress.commitsAhead} commits`;
  return `In progress: \`${inProgress.ref}\` (${inProgress.signal}), ${commits} ahead, last commit ${inProgress.lastCommitAt}`;
}

/** Renders one escalation as a numbered entry with its supporting bullets. */
function renderEntry(index: number, escalation: Escalation, isUnderHub: boolean): string {
  const { record, reply } = escalation;
  const title = reply?.title ?? '';
  const lines = [
    `${index}. **#${record.number} ${title}**: Recommend \`${record.recommendation}\` (${record.confidence} confidence)`,
    `   - ${record.reason}`,
    `   - Verdicts: ${Object.entries(record.verdicts)
      .map(([dimension, verdict]) => `${dimension} \`${verdict ?? 'n/a'}\``)
      .join(', ')}`,
  ];
  if (record.inProgress !== null) lines.push(`   - ${describeInProgress(record.inProgress)}`);
  if (record.dependsOn !== null && record.dependsOn !== undefined && !isUnderHub) {
    lines.push(`   - Depends on #${record.dependsOn}`);
  }
  if (reply !== undefined && reply.remainder.length > 0) {
    lines.push(`   - Remainder: ${reply.remainder.join('; ')}`);
  }
  return lines.join('\n');
}

/** Renders one page, with a heading for each hub and each overlap group that the page holds. */
function renderPage(input: {
  groupOf: ReadonlyMap<number, OverlapGroup>;
  members: readonly Escalation[];
  page: number;
  pageCount: number;
  titles: ReadonlyMap<number, string>;
}): DigestPage {
  const dependents = new Map<number, number>();
  for (const { record } of input.members) {
    if (record.dependsOn !== null && record.dependsOn !== undefined) {
      dependents.set(record.dependsOn, (dependents.get(record.dependsOn) ?? 0) + 1);
    }
  }
  const hubs = [...dependents].filter(([, count]) => count >= 2).map(([hub]) => hub);

  const blocks = [`## Escalations, page ${input.page} of ${input.pageCount}`];
  const entries: DigestPage['entries'] = [];
  let heading: string | undefined;
  for (const [offset, escalation] of input.members.entries()) {
    const { record } = escalation;
    const hub =
      record.dependsOn !== null && record.dependsOn !== undefined && hubs.includes(record.dependsOn)
        ? record.dependsOn
        : undefined;
    const group = input.groupOf.get(record.number);
    const nextHeading =
      hub === undefined ? (group === undefined ? undefined : `overlap:${group.tickets.join(',')}`) : `hub:${hub}`;
    if (nextHeading !== heading && nextHeading !== undefined) {
      blocks.push(
        hub === undefined
          ? renderGroupHeading(group)
          : renderHubHeading(hub, dependents.get(hub) ?? 0, input.titles.get(hub)),
      );
    }
    heading = nextHeading;

    const index = offset + 1;
    blocks.push(renderEntry(index, escalation, hub !== undefined));
    entries.push({ index, number: record.number, recommendation: record.recommendation });
  }
  return { entries, hubs, markdown: `${blocks.join('\n\n')}\n`, page: input.page };
}

/** Renders the heading of an overlap group, with its survivor and the assessors' reasons. */
function renderGroupHeading(group: OverlapGroup | undefined): string {
  if (group === undefined) return '';
  const tickets = group.tickets.map((ticket) => `#${ticket}`).join(', ');
  const reasons = group.reasons.map((reason) => `- ${reason}`).join('\n');
  return `### Overlap group: ${tickets}\n\nRecommended survivor: #${group.survivor}.\n\n${reasons}`.trimEnd();
}

/** Renders the heading of a hub: the open ticket on which several escalations depend. */
function renderHubHeading(hub: number, count: number, title: string | undefined): string {
  const name = title === undefined ? `#${hub}` : `#${hub} ${title}`;
  return `### Hub: ${name}\n\n${count} escalations below depend on the outcome of #${hub}. Decide it first.`;
}

// endregion | Helpers
