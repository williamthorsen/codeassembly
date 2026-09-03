/** Which stage rejected an artifact, so a report can group by cause rather than presenting one undifferentiated list. */
export type ContentDefectKind = 'collision' | 'dependency' | 'frontmatter' | 'render' | 'resolution' | 'root';

/** One rejected artifact: where it lives relative to the content root, which stage rejected it, and why. */
export interface ContentDefect {
  readonly file: string;
  readonly kind: ContentDefectKind;
  readonly detail: string;
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
