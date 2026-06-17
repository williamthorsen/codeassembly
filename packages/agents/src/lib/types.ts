/** Supported platform identifiers. */
export type PlatformId = 'claude' | 'rovodev';

/** Configuration for a single platform. */
export interface PlatformConfig {
  readonly id: PlatformId;
  /** Relative path from home to the platform's dot directory (e.g., `.claude`). */
  readonly homeDir: string;
  /** Name of the skills directory under the platform home. */
  readonly skillsDirName: string;
  /** Name of the subagents directory under the platform home. */
  readonly subagentsDirName: string;
  /** Name of the scripts directory under the platform home. */
  readonly scriptsDirName: string;
  /** Filename of the frontmatter overlay YAML for this platform. */
  readonly frontmatterFile: string;
}

/** A single entry in the manifest tracking an installed file or directory. */
export interface ManifestEntry {
  /** Path relative to the platform's home directory. */
  readonly relativePath: string;
  /** Content hash of the installed file (e.g., `sha256:abc123`). */
  readonly contentHash: string;
  /** Whether this entry was installed as a symlink. */
  readonly linked: boolean;
}

/** Manifest data for a single platform. */
export interface PlatformManifest {
  readonly platform: PlatformId;
  readonly version: string;
  readonly installedAt: string;
  readonly entries: ReadonlyArray<ManifestEntry>;
}

/** Manifest data for shared (cross-platform) entries installed to `~/.agents/`. */
export interface SharedManifest {
  readonly version: string;
  readonly installedAt: string;
  readonly entries: ReadonlyArray<ManifestEntry>;
}

/** Top-level manifest structure written to `~/.codeassembly/agents-manifest.json`. */
export interface AgentsManifest {
  readonly schemaVersion: number;
  readonly shared?: SharedManifest | undefined;
  readonly platforms: Partial<Record<PlatformId, PlatformManifest>>;
}

/** Options controlling install behavior. */
export interface InstallOptions {
  readonly platform: PlatformId | 'all';
  readonly link: boolean;
  readonly force: boolean;
  readonly dryRun: boolean;
}
