/** A declared-artifact's ownership-marker accessors: read the stamped slug, or stamp the marker into content. */
export interface ArtifactMarker {
  /** Returns the slug stamped in the content's ownership marker, or `undefined` when it carries none. */
  extractSlug(content: string): string | undefined;
  /**
   * Stamps the ownership marker into `content`, placed on its own line immediately after the frontmatter block.
   * Idempotent and frontmatter-required; see the closures in `makeArtifactMarker` for the exact contract.
   */
  injectMarker(content: string, slug: string): string;
}

/** Matches a leading `---\n...\n---\n` frontmatter block, capturing it including the closing delimiter's newline. */
const FRONTMATTER_PATTERN = /^(---\n[\s\S]*?\n---\n)/;

/**
 * Builds the ownership-marker accessors for one artifact `kind`, producing `<!-- codeassembly-${kind}:${slug} -->`
 * markers. Skills and subagents share this single implementation; each kind reads and writes only its own marker, so
 * the two namespaces never claim each other's files.
 */
export function makeArtifactMarker(kind: 'skill' | 'subagent'): ArtifactMarker {
  const markerPattern = new RegExp(`<!-- codeassembly-${kind}:([a-z0-9-]+) -->`);
  const leadingMarkerLinePattern = new RegExp(`^<!-- codeassembly-${kind}:[a-z0-9-]+ -->\\n`);

  return {
    extractSlug(content: string): string | undefined {
      return markerPattern.exec(content)?.[1];
    },

    injectMarker(content: string, slug: string): string {
      const frontmatter = FRONTMATTER_PATTERN.exec(content)?.[1];
      if (frontmatter === undefined) {
        throw new Error(`Cannot inject the ${kind} ownership marker: the content has no frontmatter block.`);
      }

      const afterFrontmatter = content.slice(frontmatter.length).replace(leadingMarkerLinePattern, '');
      return `${frontmatter}<!-- codeassembly-${kind}:${slug} -->\n${afterFrontmatter}`;
    },
  };
}
