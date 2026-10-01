/** Reads and writes the `codeassembly-triage` marker that a sweep leaves in each ticket comment it posts. */
import { type Marker, MarkerSchema } from './schemas.ts';
import type { IssueComment } from './types.ts';

/** The name that opens every marker comment. */
export const MARKER_NAME = 'codeassembly-triage';

const MARKER_PATTERN = new RegExp(String.raw`<!-- ${MARKER_NAME} (\{.*?\}) -->`, 'gs');

/** Returns the latest valid marker across `comments`, by comment date, or `null` when none contains one. */
export function findLatestMarker(comments: readonly IssueComment[]): Marker | null {
  let latest: { createdAt: string; marker: Marker } | undefined;
  for (const comment of comments) {
    const markers = parseMarkers(comment.body);
    const marker = markers.at(-1);
    if (marker !== undefined && (latest === undefined || comment.createdAt >= latest.createdAt)) {
      latest = { createdAt: comment.createdAt, marker };
    }
  }
  return latest?.marker ?? null;
}

/** Returns the date of the latest comment whose marker names `run`, or `undefined` when none does. */
export function findLatestRunMarkerDate(comments: readonly IssueComment[], run: string): string | undefined {
  let latest: string | undefined;
  for (const comment of comments) {
    if (
      parseMarkers(comment.body).some((marker) => marker.run === run) &&
      (latest === undefined || comment.createdAt > latest)
    )
      latest = comment.createdAt;
  }
  return latest;
}

/** Returns every valid marker in `body`, in order; a marker that does not parse is skipped. */
export function parseMarkers(body: string): Marker[] {
  const markers: Marker[] = [];
  for (const match of body.matchAll(MARKER_PATTERN)) {
    const json = match[1];
    if (json === undefined) continue;
    try {
      const parsed = MarkerSchema.safeParse(JSON.parse(json));
      if (parsed.success) markers.push(parsed.data);
    } catch {
      // A marker that is not JSON is someone else's text, not a record.
    }
  }
  return markers;
}

/** Renders `marker` as an HTML comment. `>` is escaped so that free text cannot close the comment early. */
export function renderMarker(marker: Marker): string {
  return `<!-- ${MARKER_NAME} ${JSON.stringify(marker).replaceAll('>', String.raw`\u003e`)} -->`;
}
