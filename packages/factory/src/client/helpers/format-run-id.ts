const KNOWN_SUFFIXES = ['-orchestrated'];

/** Strips known mode suffixes from a run ID for display. Unknown suffixes are preserved. */
export function formatRunId(runId: string): string {
  for (const suffix of KNOWN_SUFFIXES) {
    if (runId.endsWith(suffix)) {
      return runId.slice(0, -suffix.length);
    }
  }
  return runId;
}
