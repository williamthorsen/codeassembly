/** Supported harness identifiers. */
export type HarnessId = 'claude' | 'rovo';

/**
 * The canonical tool names a `{tool:NAME}` placeholder may address, spelled as Claude names them. Closed rather than
 * open: every harness maps every name, so adding one here fails the build until each mapping is filled in.
 */
export type CanonicalToolName = 'AskUserQuestion' | 'Bash' | 'Edit' | 'Glob' | 'Grep' | 'Read' | 'Task' | 'Write';

/** Top-level manifest structure written to `~/.codeassembly/agents-manifest.json`. */
export interface AgentsManifest {
  readonly schemaVersion: number;
  /**
   * The retired `~/.agents/` tier, present only in a manifest a previous version wrote. `install` and `uninstall`
   * read it to retire what was deployed there and write the manifest without it; nothing produces it.
   */
  readonly shared?: SharedManifest | undefined;
  readonly harnesses: Partial<Record<HarnessId, HarnessManifest>>;
}

/**
 * Which guidance file hosts a domain's ambient region. `harness-home` is the mechanically-loaded file under the
 * harness's home directory, rendered by `install`; `project-local` is the harness's machine-local project guidance
 * file at the project root, created and owned by `sync`.
 */
export type AmbientHostKind = 'harness-home' | 'project-local';

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
  /** What this harness calls each canonical tool, resolving `{tool:NAME}` placeholders in deployed body text. */
  readonly toolNames: Readonly<Record<CanonicalToolName, string>>;
  /** Filename of the mechanically-loaded guidance file under the harness home that hosts the ambient region. */
  readonly guidanceFileName: string;
  /**
   * Filename of the machine-local project guidance file the harness loads at launch from the project root (e.g.
   * `CLAUDE.local.md`). Hosts the project domain's ambient region.
   */
  readonly localGuidanceFileName: string;
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

/**
 * A home-domain-writing command the designated-writer guard and provenance stamp govern, spelled as the user invokes
 * it. These are the two commands that deploy catalog content into the home domain (`~/.agents/`, `~/.claude/`,
 * `~/.rovo/`); `uninstall` and `configure-hooks` also write home files but deploy none, so they sit outside the
 * guard's scope, and bare `sync` writes project trees and refuses to run from the home directory.
 */
export type HomeWriteCommand = 'install' | 'sync --global';

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
  /** Whether a home-domain write proceeds from an installation the `home-writer` setting does not designate. */
  readonly shouldOverrideWriter?: boolean;
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

/**
 * Manifest data for the retired cross-harness tier a previous version installed to `~/.agents/`. Retained as the shape
 * the retirement pass reads; no pass writes it.
 */
export interface SharedManifest {
  readonly version: string;
  readonly installedAt: string;
  readonly entries: ReadonlyArray<ManifestEntry>;
}
