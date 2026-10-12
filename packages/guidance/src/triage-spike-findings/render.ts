/** Renders the dispositions comment and the per-issue comments from a dispositions record. */
import { type DispositionsRecord, hasTicketItem, type Item } from './schemas.ts';

/** The text that stands in for a ticket number that step 7 has not yet assigned. */
export const PENDING = '(pending)';

/** Renders the comment that the skill posts on the triage ticket: the table, the challenge, and the notes. */
export function renderDispositionsComment(record: DispositionsRecord): string {
  const umbrella = record.umbrella === null ? PENDING : `#${record.umbrella}`;
  const umbrellaSentence = hasTicketItem(record) ? ` The umbrella for the new tickets is ${umbrella}.` : '';
  const lines = [
    `## Dispositions of the findings of ${record.source}`,
    '',
    `Every item that the findings left undisposed, with its disposition and grades. Confidence grades advisability: \`high\` is clearly worth doing, \`medium\` is worth doing but arguable, \`low\` is not worth a ticket now. Value grades how much the item matters.${umbrellaSentence}`,
    '',
    '| Item | Disposition | Confidence | Value | Where | Reason |',
    '| --- | --- | --- | --- | --- | --- |',
    ...record.items.map((item) => renderRow(item)),
    '',
    '## Challenge',
    '',
    record.challengeSummary.trim(),
  ];
  if (record.notes.length > 0) {
    lines.push('', '## Labels and follow-ups', '', ...record.notes.map((note) => `- ${note}`));
  }
  return `${lines.join('\n')}\n`;
}

/** Renders one comment per issue that a `comment` disposition names, grouping the items that name one issue. */
export function renderIssueComments(record: DispositionsRecord): Map<number, string> {
  const grouped = new Map<number, Item[]>();
  for (const item of record.items) {
    if (item.disposition !== 'comment' || typeof item.target !== 'number') continue;
    grouped.set(item.target, [...(grouped.get(item.target) ?? []), item]);
  }
  const comments = new Map<number, string>();
  for (const [issue, items] of grouped) {
    const lines = [
      `A triage of the findings of ${record.source} (#${record.triageTicket}) routes the following to this issue:`,
      '',
      ...items.map(
        (item) => `- **${item.title}** (confidence ${item.confidence}, value ${item.value}): ${item.reason}`,
      ),
    ];
    comments.set(issue, `${lines.join('\n')}\n`);
  }
  return comments;
}

// region | Helpers

/** Escapes the characters that would break a Markdown table cell. */
function escapeCell(text: string): string {
  return text
    .replaceAll('|', String.raw`\|`)
    .replaceAll(/\r?\n/g, ' ')
    .trim();
}

/** Renders one item's table row. */
function renderRow(item: Item): string {
  const cells = [
    `${item.id} ${item.title}`,
    item.disposition,
    item.confidence,
    item.value,
    renderWhere(item),
    item.reason,
  ];
  return `| ${cells.map((cell) => escapeCell(cell)).join(' | ')} |`;
}

/** Renders the where column: the ticket for a `ticket` or `comment` item, the target for a `merge`, empty for a `drop`. */
function renderWhere(item: Item): string {
  switch (item.disposition) {
    case 'comment':
      return `#${String(item.target)}`;
    case 'merge':
      return `merged into ${String(item.target)}`;
    case 'ticket':
      return item.ticket === null ? PENDING : `#${item.ticket}`;
    default:
      return '';
  }
}

// endregion | Helpers
