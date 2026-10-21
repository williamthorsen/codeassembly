import type { ReportLine } from '../../lib/report-line.ts';
import type { AmbientHostPlan, AmbientSkipReason } from './ambient-hosts.ts';

/** The dry-run line for one host's plan, naming the host and the action that a real run would take on it. */
export function describeAmbientHostPlan(hostPath: string, plan: AmbientHostPlan): ReportLine | undefined {
  if (plan.kind === 'skip') {
    const reason = describeAmbientSkip(plan.reason, hostPath);
    return reason === undefined ? undefined : { level: 'info', text: `  skip ambient delivery: ${reason}` };
  }
  switch (plan.action) {
    case 'append':
      return { level: 'info', text: `  append the ambient region to ${hostPath}` };
    case 'create':
      return { level: 'info', text: `  create ${hostPath}, containing the ambient region` };
    case 'inject':
      return { level: 'info', text: `  inject the ambient region in ${hostPath}` };
  }
}

/**
 * The reason one ambient host is skipped, or `undefined` when the skip is not worth reporting. A scope declaring
 * nothing ambient is an ordinary outcome rather than news, so neither path reports it; every other cause names a
 * problem that the user can act on, and both paths report it in these same words.
 */
export function describeAmbientSkip(reason: AmbientSkipReason, hostPath: string): string | undefined {
  switch (reason.cause) {
    case 'damaged-region':
      return describeDamagedRegion(hostPath);
    case 'not-needed':
      return undefined;
    case 'stale-install':
      return describeStaleAmbientHost(reason.status, hostPath);
  }
}

/** The sentence naming a host whose ambient region is too damaged for any transform to touch. */
export function describeDamagedRegion(hostPath: string): string {
  return `${hostPath} has a damaged ambient region.`;
}

/** The advisory naming a host that a run writes and that git does not ignore. */
export function describeUnignoredHost(hostPath: string): ReportLine {
  return {
    glyph: 'warning',
    level: 'warn',
    text:
      `${hostPath} is not git-ignored. It contains machine-local guidance, so add it to .gitignore to keep it ` +
      'out of version control.',
  };
}

// region | Helpers

/** The reason a harness-home guidance file is too stale to receive ambient delivery, naming the remedy. */
function describeStaleAmbientHost(status: 'malformed' | 'missing' | 'no-region', guidanceFile: string): string {
  switch (status) {
    case 'missing':
      return `${guidanceFile} does not exist. Run \`codeassembly install\`, then re-run \`sync --global\`.`;
    case 'no-region':
      return `${guidanceFile} doesn't have an ambient region. Run \`codeassembly install\` to refresh it, then re-run \`sync --global\`.`;
    case 'malformed':
      return `${guidanceFile} has a damaged ambient region: an unmatched marker, or more than one region. Repair its codeassembly-ambient markers, then re-run \`sync --global\`.`;
  }
}

// endregion | Helpers
