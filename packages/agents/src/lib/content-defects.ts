import type { HarnessId } from './types.ts';

/**
 * One rejected artifact: the path the defect is attributed to, which stage rejected it, and why. The path is
 * relative to the content root for an artifact, and absolute for a deploy target, which sits outside any root.
 */
export interface ContentDefect {
  readonly file: string;
  readonly kind: ContentDefectKind;
  readonly detail: string;
}

/** Which stage rejected an artifact, so a report can group by cause rather than presenting one undifferentiated list. */
export type ContentDefectKind =
  'collision' | 'dependency' | 'frontmatter' | 'render' | 'resolution' | 'root' | 'target';

/** A render defect paired with the harness whose render raised it, before harness-invariant ones are collapsed. */
export interface HarnessDefect {
  readonly harnessId: HarnessId;
  readonly defect: ContentDefect;
}

/**
 * Collapses per-harness render defects into one list. A defect every validated harness raised is emitted once, since
 * it is a property of the source rather than of any harness; one raised by a subset keeps the harnesses in its detail,
 * because that subset is the finding.
 */
export function foldHarnessDefects(
  raised: ReadonlyArray<HarnessDefect>,
  harnessIds: ReadonlyArray<HarnessId>,
): ReadonlyArray<ContentDefect> {
  const byDefect = new Map<string, { defect: ContentDefect; harnesses: Array<HarnessId> }>();
  for (const { harnessId, defect } of raised) {
    const key = JSON.stringify([defect.file, defect.kind, defect.detail]);
    const entry = byDefect.get(key);
    if (entry === undefined) {
      byDefect.set(key, { defect, harnesses: [harnessId] });
    } else if (!entry.harnesses.includes(harnessId)) {
      entry.harnesses.push(harnessId);
    }
  }

  return Array.from(byDefect.values(), ({ defect, harnesses }) =>
    harnesses.length === harnessIds.length
      ? defect
      : { ...defect, detail: `${defect.detail} (${harnesses.join(', ')})` },
  );
}

/** Groups defects by file and renders each as an indented, kind-tagged block, ordered so two runs read alike. */
export function formatContentDefects(defects: ReadonlyArray<ContentDefect>): string {
  const byFile = new Map<string, Array<ContentDefect>>();
  for (const defect of defects) {
    const group = byFile.get(defect.file) ?? [];
    group.push(defect);
    byFile.set(defect.file, group);
  }

  return Array.from(byFile.keys())
    .toSorted()
    .map((file) => {
      const group = (byFile.get(file) ?? []).toSorted(
        (a, b) => a.kind.localeCompare(b.kind) || a.detail.localeCompare(b.detail),
      );
      const lines = group.map((defect) => `  [${defect.kind}] ${defect.detail.replaceAll('\n', '\n    ')}`);
      return `${file}\n${lines.join('\n')}`;
    })
    .join('\n\n');
}
