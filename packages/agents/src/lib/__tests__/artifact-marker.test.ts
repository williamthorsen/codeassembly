import { describe, expect, it } from 'vitest';

import { makeArtifactMarker } from '../artifact-marker.ts';

const FILE = '---\nname: people-report\nuser-invocable: true\n---\n\n# People report\n\nBody.\n';

describe(makeArtifactMarker, () => {
  describe.each(['skill', 'subagent'] as const)('kind=%s', (kind) => {
    const marker = makeArtifactMarker(kind);
    const otherKind = kind === 'skill' ? 'subagent' : 'skill';

    it('returns the slug stamped by injectMarker', () => {
      expect(marker.extractSlug(marker.injectMarker(FILE, 'people-report'))).toBe('people-report');
    });

    it('returns undefined when no marker is present', () => {
      expect(marker.extractSlug(FILE)).toBeUndefined();
    });

    it("returns undefined for the other kind's marker, keeping the namespaces disjoint", () => {
      const otherMarked = makeArtifactMarker(otherKind).injectMarker(FILE, 'people-report');

      expect(marker.extractSlug(otherMarked)).toBeUndefined();
    });

    it('returns undefined for a rulebook marker, keeping the namespaces disjoint', () => {
      expect(
        marker.extractSlug('---\nname: x\n---\n<!-- codeassembly-rulebook:shell-conventions -->\n'),
      ).toBeUndefined();
    });

    it('inserts the marker immediately after the frontmatter block', () => {
      const output = marker.injectMarker(FILE, 'people-report');

      expect(output).toBe(
        `---\nname: people-report\nuser-invocable: true\n---\n<!-- codeassembly-${kind}:people-report -->\n\n# People report\n\nBody.\n`,
      );
    });

    it('is idempotent: re-injecting the same slug leaves the content unchanged', () => {
      const once = marker.injectMarker(FILE, 'people-report');

      expect(marker.injectMarker(once, 'people-report')).toBe(once);
    });

    it('throws a clear error when the content has no frontmatter block', () => {
      expect(() => marker.injectMarker('# No frontmatter\n', 'people-report')).toThrow(/frontmatter/i);
    });
  });
});
