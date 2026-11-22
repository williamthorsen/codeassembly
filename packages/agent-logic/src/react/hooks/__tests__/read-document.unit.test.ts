import { describe, expect, it } from 'vitest';

import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import type { OtherKindHandlers } from '../document-types.ts';
import { describeShown, readStoredFile } from '../read-document.ts';

const CHART_TEXT = JSON.stringify(buildMinimalConfig());

describe(readStoredFile, () => {
  it('opens stored config text as a chart named after the file', () => {
    const { document } = readStoredFile('greeting.agent-logic.json', { ok: true, text: CHART_TEXT }, 1);
    expect(document).toMatchObject({ kind: 'chart', name: 'greeting.agent-logic.json', origin: 'File', key: 1 });
  });

  it('reports stored text that is not a config', () => {
    const { document, report } = readStoredFile('notes.md', { ok: true, text: '# Notes' }, 1);
    expect(document).toBeUndefined();
    expect(report).toMatchObject({ title: 'File not loaded', source: 'File: notes.md' });
  });

  it.each([
    ['missing', 'File not found'],
    ['unavailable', 'File not opened'],
  ] as const)('reports a %s file as %j', (reason, title) => {
    const { report } = readStoredFile('a.agent-logic.json', { ok: false, reason, message: 'No.' }, 1);
    expect(report?.title).toBe(title);
  });

  it('when the app reads the text as its own kind, opens that document', () => {
    const { document } = readStoredFile('notes.md', { ok: true, text: '# Notes' }, 2, NOTE_KIND);
    expect(document).toEqual({ kind: 'note', key: 2, name: 'notes', fileName: 'notes.md' });
  });

  it('when the app does not read the text as its own kind, opens it as a chart', () => {
    const { document } = readStoredFile('greeting.agent-logic.json', { ok: true, text: CHART_TEXT }, 1, NOTE_KIND);
    expect(document?.kind).toBe('chart');
  });
});

describe(describeShown, () => {
  it("announces a document of the app's own kind through its handler", () => {
    const document: Note = { kind: 'note', key: 1, name: 'notes', fileName: 'notes.md' };
    expect(describeShown({ document }, NOTE_KIND)).toBe('Opened the note notes.md.');
  });

  it('returns undefined for the start page', () => {
    expect(describeShown({})).toBeUndefined();
  });
});

// region | Helpers
interface Note {
  kind: 'note';
  key: number;
  name: string;
  fileName: string;
}

const NOTE_KIND: OtherKindHandlers<Note> = {
  read: (name, _text, key) =>
    name.endsWith('.md') ? { kind: 'note', key, name: name.slice(0, -'.md'.length), fileName: name } : undefined,
  describe: (document) => `Opened the note ${document.fileName}.`,
};
// endregion | Helpers
