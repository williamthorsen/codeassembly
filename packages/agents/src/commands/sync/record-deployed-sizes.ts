import { describeError } from '@williamthorsen/toolbelt.errors';

import { appendSnapshot } from '../../deployed-sizes/append-snapshot.ts';
import { measureDeployment } from '../../deployed-sizes/measure-deployment.ts';
import { readLatestSnapshot } from '../../deployed-sizes/read-record.ts';
import { resolveRecordPath } from '../../deployed-sizes/resolve-record-path.ts';
import { SNAPSHOT_SCHEMA_VERSION } from '../../deployed-sizes/schema.ts';
import { shouldAppend } from '../../deployed-sizes/should-append.ts';
import type { SizeSnapshot } from '../../deployed-sizes/types.ts';
import { readSourceCommit } from '../../lib/home-provenance.ts';
import { readRunningPackageVersion } from '../../lib/running-package.ts';
import { resolveRepo } from '../../shared/resolve-repo.ts';
import { collectDeployedPaths, type DeployedPathSources } from './collect-deployed-paths.ts';
import type { SyncDomain } from './sync-domain.ts';

/**
 * Measures what the run deployed and appends a snapshot to the domain's record, when the gate allows it. Prints
 * nothing on success: The record is read by the `sizes` command rather than reported by the sync.
 *
 * `packageRoot` is the source tree from which the deploying binary ran. It stamps every snapshot's `sourceCommit`,
 * and it is the tree that the append gate judges in the home domain, whose content comes from that package.
 *
 * Every failure is swallowed after one warning naming what could not be recorded. The pass runs after the last write,
 * where a throw would report a completed deployment as a failure, and no size condition may fail a sync.
 */
export async function recordDeployedSizes(
  plan: DeployedPathSources,
  domain: SyncDomain,
  homeDir: string,
  packageRoot: string,
): Promise<void> {
  try {
    const recordPath = resolveRecordPath(
      domain.ambient === 'harness-home'
        ? { home: homeDir, domain: 'home' }
        : { home: homeDir, domain: 'repo', repo: await resolveRepo(domain.baseDir) },
    );
    const measured = await measureDeployment(await collectDeployedPaths(plan, domain, homeDir));
    const previous = await readLatestSnapshot(recordPath);
    // The repo domain's content comes from the consumer repo's own declared sources and declaration, so its branch
    // is the one the gate must judge; the home domain's comes from the running package.
    const sourceRoot = domain.ambient === 'harness-home' ? packageRoot : domain.baseDir;
    if (!(await shouldAppend({ measured, previous, sourceRoot }))) {
      return;
    }

    const sourceCommit = await readSourceCommit(packageRoot);
    const snapshot: SizeSnapshot = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      kind: 'snapshot',
      recordedAt: new Date().toISOString(),
      version: readRunningPackageVersion(),
      ...(sourceCommit !== undefined && { sourceCommit }),
      files: measured.files,
      aggregates: measured.aggregates,
    };
    await appendSnapshot(recordPath, snapshot);
  } catch (error: unknown) {
    console.warn(`⚠️ The deployment's sizes were not recorded: ${describeError(error)}`);
  }
}
