import { describeError } from '@williamthorsen/toolbelt.errors';

import { appendSnapshot } from '../../deployed-sizes/append-snapshot.ts';
import { buildSizeReport, type SizeReport } from '../../deployed-sizes/build-size-report.ts';
import { measureDeployment } from '../../deployed-sizes/measure-deployment.ts';
import { readLatestSnapshot } from '../../deployed-sizes/read-record.ts';
import { resolveRecordPath } from '../../deployed-sizes/resolve-record-path.ts';
import { resolveRepoRoot } from '../../deployed-sizes/resolve-repo-root.ts';
import { SNAPSHOT_SCHEMA_VERSION } from '../../deployed-sizes/schema.ts';
import { shouldAppend } from '../../deployed-sizes/should-append.ts';
import type { SizeSnapshot } from '../../deployed-sizes/types.ts';
import { readSourceCommit } from '../../lib/home-provenance.ts';
import { readRunningPackageVersion } from '../../lib/running-package.ts';
import { resolveRepo } from '../../shared/resolve-repo.ts';
import { collectDeployedPaths, type DeployedPathSources, type ResolveSourceRoot } from './collect-deployed-paths.ts';
import type { SyncDomain } from './sync-domain.ts';

/** What the size pass produced: the report that a live sync renders, or the reason it produced none. */
export type SizeReportOutcome =
  | { readonly kind: 'measured'; readonly report: SizeReport }
  | {
      readonly kind: 'failed';
      readonly message: string;
    };

/**
 * Measures what the run deployed, builds the report that the sync renders, and appends a snapshot to the domain's
 * record when the gate allows it.
 *
 * The measurement, the report, and the append are independent: The report is produced whether or not the gate lets
 * the append through, which is what lets an unchanged deployment state its aggregates and a feature branch state its
 * diff against the last default-branch snapshot.
 *
 * `packageRoot` is the source tree from which the deploying binary ran. It stamps every snapshot's `sourceCommit`,
 * and it is the tree that the append gate judges in the home domain, whose content comes from that package.
 *
 * Every failure is caught and reported as the `failed` outcome rather than thrown. The pass runs after the last
 * write, where a throw would report a completed deployment as a failure, and no size condition may fail a sync.
 */
export async function recordDeployedSizes(input: {
  plan: DeployedPathSources;
  domain: SyncDomain;
  homeDir: string;
  packageRoot: string;
  resolveSourceRoot: ResolveSourceRoot;
}): Promise<SizeReportOutcome> {
  const { plan, domain, homeDir, packageRoot, resolveSourceRoot } = input;
  try {
    const recordPath = resolveRecordPath(
      domain.ambient === 'harness-home'
        ? { home: homeDir, domain: 'home' }
        : { home: homeDir, domain: 'repo', repo: await resolveRepo(domain.baseDir) },
    );
    const set = await collectDeployedPaths(plan, domain, homeDir, resolveSourceRoot);
    const measured = await measureDeployment(set);
    const previous = await readLatestSnapshot(recordPath);
    // The repo domain's content comes from the consumer repo's own declared sources and declaration, so its branch
    // is the one the gate must judge and its repository the one whose artifacts the reader can edit; the home
    // domain's comes from the running package, so both answers are that package's tree.
    const sourceRoot = domain.ambient === 'harness-home' ? packageRoot : domain.baseDir;
    const report = buildSizeReport({ measured, previous, set, repoRoot: await resolveRepoRoot(sourceRoot) });

    if (await shouldAppend({ measured, previous, sourceRoot })) {
      const sourceCommit = await readSourceCommit(packageRoot);
      const snapshot: SizeSnapshot = {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        kind: 'snapshot',
        recordedAt: new Date().toISOString(),
        version: readRunningPackageVersion(),
        ...(sourceCommit !== undefined && { sourceCommit }),
        files: measured.files,
        expansions: measured.expansions,
        aggregates: measured.aggregates,
      };
      await appendSnapshot(recordPath, snapshot);
    }
    return { kind: 'measured', report };
  } catch (error: unknown) {
    return { kind: 'failed', message: describeError(error) };
  }
}
