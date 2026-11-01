/**
 * The evidence block that the dispositions comment ends with: a hidden HTML comment containing versioned JSON, from
 * which a later tool reads which subjects a triage disposed of, at which commit, without parsing the prose.
 */
import { z } from 'zod';

import { orderItems } from './order.ts';
import { CommitSchema, DISPOSITIONS, type DispositionsRecord, type Item } from './schemas.ts';

const MARKER = 'codeassembly:triage-evidence';
const VERSION = 1;
const BLOCK_PATTERN = new RegExp(String.raw`<!-- ${MARKER} v(\d+)\n([\s\S]*?)\n-->`);

export const EvidenceBlockSchema = z.object({
  version: z.literal(VERSION),
  source: z.string().min(1),
  triageTicket: z.number().int().positive(),
  commit: CommitSchema,
  items: z.array(
    z.object({
      id: z.string().min(1),
      key: z.string().min(1),
      paths: z.array(z.string().min(1)).min(1),
      disposition: z.enum(DISPOSITIONS),
      /** The ticket number of a `ticket` item (null until created), the issue of a `comment`, the target id of a `merge`. */
      where: z.union([z.number().int().positive(), z.string().min(1), z.null()]),
    }),
  ),
});

export type EvidenceBlock = z.infer<typeof EvidenceBlockSchema>;

/**
 * Reads the evidence block from a comment body. Returns `undefined` when the body does not contain a block, or contains
 * one of another version or with a malformed payload, so that a caller scanning many comments skips it.
 */
export function parseEvidenceBlock(body: string): EvidenceBlock | undefined {
  const match = BLOCK_PATTERN.exec(body);
  if (match === null || match[1] !== String(VERSION) || match[2] === undefined) return undefined;
  let payload: unknown;
  try {
    payload = JSON.parse(match[2]);
  } catch {
    return undefined;
  }
  const parsed = EvidenceBlockSchema.safeParse(payload);
  return parsed.success ? parsed.data : undefined;
}

/** Renders the evidence block of a gate-checked record, or `undefined` when no item has evidence. */
export function renderEvidenceBlock(record: DispositionsRecord): string | undefined {
  const items: EvidenceBlock['items'] = [];
  for (const item of orderItems(record)) {
    if (item.evidence === undefined) continue;
    const { key, paths } = item.evidence;
    items.push({ id: item.id, key, paths, disposition: item.disposition, where: describeWhere(item) });
  }
  if (items.length === 0) return undefined;
  if (record.commit === undefined) throw new Error('A record whose items have evidence must have a commit.');
  const block: EvidenceBlock = {
    version: VERSION,
    source: record.source,
    triageTicket: record.triageTicket,
    commit: record.commit,
    items,
  };
  // Escape `>` so that a value containing `-->` cannot close the HTML comment; the escape is still valid JSON.
  const json = JSON.stringify(block).replaceAll('>', String.raw`\u003e`);
  return `<!-- ${MARKER} v${VERSION}\n${json}\n-->`;
}

// region | Helpers

/** Returns where an item went: its ticket, its issue, or its merge target; null for a drop. */
function describeWhere(item: Item): EvidenceBlock['items'][number]['where'] {
  switch (item.disposition) {
    case 'ticket':
      return item.ticket;
    case 'drop':
      return null;
    default:
      return item.target;
  }
}

// endregion | Helpers
