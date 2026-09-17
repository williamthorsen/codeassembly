/**
 * Removes a memory's entry from `MEMORY.md` content, matching the list item by its link target's file basename, since
 * how an entry is titled varies from store to store. When the removal empties the entry's section, the orphaned `##`
 * header and its blank lines go too. A basename with no matching line is a no-op that reports `removed: false`.
 */
export function removeMemoryIndexEntry(content: string, fileBasename: string): { content: string; removed: boolean } {
  const target = `](${fileBasename})`;
  const lines = content.split('\n');
  const kept: string[] = [];
  let removed = false;

  for (const line of lines) {
    if (isListItem(line) && line.includes(target)) {
      removed = true;
      continue;
    }
    kept.push(line);
  }

  if (!removed) {
    return { content, removed: false };
  }
  return { content: dropEmptySections(kept).join('\n'), removed: true };
}

// region | Helpers

/** True when a line is a markdown list item (`-` or `*` bullet, at any indentation). */
function isListItem(line: string): boolean {
  return /^\s*[-*] /.test(line);
}

/**
 * Drops any `##` section whose body, the lines between its header and the next `#` or `##` header or end of file, is
 * entirely blank, along with that blank body.
 */
function dropEmptySections(lines: readonly string[]): string[] {
  const out: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) {
      break;
    }
    if (!line.startsWith('## ')) {
      out.push(line);
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < lines.length && !/^#{1,2} /.test(lines[end] ?? '')) {
      end += 1;
    }
    const body = lines.slice(index + 1, end);
    if (body.some((bodyLine) => bodyLine.trim() !== '')) {
      out.push(line, ...body);
    }
    index = end;
  }

  return out;
}

// endregion | Helpers
