/** Supported harness identifiers. */
export type HarnessId = 'claude' | 'rovodev';

/** Top-level manifest structure written to `~/.codeassembly/agents-manifest.json`. */
export interface AgentsManifest {
  readonly schemaVersion: number;
  readonly shared?: SharedManifest | undefined;
  readonly harnesses: Partial<Record<HarnessId, HarnessManifest>>;
}

/** Configuration for a single harness. */
export interface HarnessConfig {
  readonly id: HarnessId;
  /** Relative path from home to the harness's dot directory (e.g., `.claude`). */
  readonly homeDir: string;
  /** Name of the skills directory under the harness home. */
  readonly skillsDirName: string;
  /** Name of the subagents directory under the harness home. */
  readonly subagentsDirName: string;
  /** Name of the scripts directory under the harness home. */
  readonly scriptsDirName: string;
  /** Filename of the harness's user-curated config file under its home (e.g. `settings.json`). */
  readonly configFileName: string;
  /** Filename of the frontmatter overlay YAML for this harness. */
  readonly frontmatterFile: string;
  /** Prefix a `{skill:<slug>}` invocation token renders to (e.g. `/` for Claude, `!` for Rovo). */
  readonly skillSigil: string;
  /** Prefix a `{subagent:<slug>}` invocation token renders to; empty on both current harnesses (a bare slug dispatches). */
  readonly subagentSigil: string;
}

/** Manifest data for a single harness. */
export interface HarnessManifest {
  readonly harness: HarnessId;
  readonly version: string;
  readonly installedAt: string;
  readonly entries: ReadonlyArray<ManifestEntry>;
}

/** Options controlling install behavior. */
export interface InstallOptions {
  readonly harness: HarnessId | 'all';
  readonly link: boolean;
  readonly force: boolean;
  readonly dryRun: boolean;
  /** Whether `install` also wires the session-lifecycle hook entries; `--skip-hooks` clears it (absent reads as true). */
  readonly hooks?: boolean;
  /** Whether `configure-hooks` prints the hook entries instead of writing them (`--print`). */
  readonly print?: boolean;
}

/** A single entry in the manifest tracking an installed file or directory. */
export interface ManifestEntry {
  /** Path relative to the harness's home directory. */
  readonly relativePath: string;
  /** Content hash of the installed file (e.g., `sha256:abc123`). */
  readonly contentHash: string;
  /** Whether this entry was installed as a symlink. */
  readonly linked: boolean;
}

/** Manifest data for shared (cross-harness) entries installed to `~/.agents/`. */
export interface SharedManifest {
  readonly version: string;
  readonly installedAt: string;
  readonly entries: ReadonlyArray<ManifestEntry>;
}
