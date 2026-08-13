/** How the smoke test should invoke a bundle. Stdin is piped only when `stdin` is provided. */
export interface SmokeTestInvocation {
  /** Argv to pass to the bundled `.mjs`. Defaults to no args. */
  args?: readonly string[];
  /** UTF-8 body to pipe on stdin. Defaults to leaving stdin closed (EOF immediately). */
  stdin?: string;
  /**
   * Working directory passed to `spawn`. Defaults to inheriting the parent's cwd. Bundles whose
   * output depends on the surrounding filesystem (preferences files, branch manifest) should
   * point this at a self-contained fixture directory so the smoke test is hermetic.
   */
  cwd?: string;
  /**
   * Environment-variable overrides passed to `spawn`. Bundles that read the ambient `HOME` (e.g.,
   * to discover `~/.agents/preferences.yaml`) should set `HOME` here to keep the smoke test from
   * depending on the developer's actual home directory contents.
   */
  env?: NodeJS.ProcessEnv;
  /** Optional structural assertion run against the parsed stdout JSON. Throw to signal failure. */
  assertResult?: (result: unknown) => void;
}
