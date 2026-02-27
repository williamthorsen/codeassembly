/** Constructs a unique key for a run using the format "projectSlug/ticketId/runId". */
export function toRunKey(projectSlug: string, ticketId: string, runId: string): string {
  return `${projectSlug}/${ticketId}/${runId}`;
}
