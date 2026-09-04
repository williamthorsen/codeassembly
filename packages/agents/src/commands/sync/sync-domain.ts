import type { AmbientHostKind } from '../../lib/types.ts';

/** The one per-domain difference: the base dir to resolve and deploy under, and where ambient blocks land. */
export interface SyncDomain {
  readonly baseDir: string;
  /**
   * Which guidance file hosts this domain's ambient region. Both domains inject into a per-harness region; they
   * differ only in the host and in who creates it — `install` renders the harness-home region, while `sync` owns
   * the project-local one because `install` does not manage user-local files.
   */
  readonly ambient: AmbientHostKind;
  /**
   * Root that rendered links to this domain's own deployed trees are written under: `~` for the home domain, the
   * absolute project root for the project domain. Without it a project-deployed artifact addresses the home harness
   * dir, which a project sync never populates.
   */
  readonly anchorBase: string;
}
