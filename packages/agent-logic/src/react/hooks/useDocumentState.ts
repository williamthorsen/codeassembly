import type { FileStore } from '@williamthorsen/toolbelt.text-file-store/proposed';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Example } from '../../examples/examples.ts';
import { describeNotLoaded } from './describe-load-outcome.ts';
import {
  type DocumentReport,
  type InputOrigin,
  isChartDocument,
  type LoadFailure,
  type LoadOptions,
  type OpenDocument,
  type OtherDocument,
  type OtherKindHandlers,
} from './document-types.ts';
import { buildExampleSearch } from './example-location.ts';
import { buildFileSearch, buildStartLocation, buildVisualizationsSearch } from './file-location.ts';
import { labelSource } from './label-source.ts';
import { describeConflict } from './load-messages.ts';
import {
  buildChartDocument,
  describeShown,
  isStartPageShown,
  readConfigText,
  readExample,
  readLocation,
  readStoredFile,
  type Shown,
} from './read-document.ts';
import { buildStoredUploadName, buildStoredUploadText } from './stored-upload.ts';
import { useUnknownExample } from './useUnknownExample.ts';

export interface DocumentState<TOther extends OtherDocument = never> {
  /** The open document; absent while the start page shows or a stored file is being read. */
  document: OpenDocument<TOther> | undefined;
  /** Whether a stored file is being read, during which the page shows neither a document nor the start page. */
  isOpening: boolean;
  /** The slug of the open example, which the sidebar marks as current. */
  currentSlug: string | undefined;
  /** The name of the open stored file, which the sidebar marks as current. */
  currentFileName: string | undefined;
  /** Whether the document region shows the Visualizations table, which the sidebar marks as current. */
  isVisualizationsOpen: boolean;
  report: DocumentReport | undefined;
  unknownExample: string | undefined;
  chooseExample: (example: Example) => void;
  chooseStoredFile: (name: string) => void;
  /** Writes the Upload card's text into the store and opens it as a chart, or returns why it did not load. */
  loadText: (text: string, origin: InputOrigin, options?: LoadOptions) => Promise<LoadFailure | undefined>;
  openStart: () => void;
  openVisualizations: () => void;
  /** Clears what a card's load makes stale: the unknown example's warning and a report on a document not opened. */
  prepareLoad: () => void;
  /**
   * Writes a file into the store and opens the document that `buildDocument` returns at the file's URL, or returns
   * what `fail` makes of a name that the store holds or a write that it refused.
   */
  storeAndOpen: (
    write: StoredWrite,
    fail: (failure: LoadFailure) => LoadFailure,
    buildDocument: (key: number) => OpenDocument<TOther>,
    options?: StoreAndOpenOptions,
  ) => Promise<LoadFailure | undefined>;
}

/**
 * How `storeAndOpen` completes a write: `afterWrite` runs once the file is stored and returns a note that the
 * announcement adds, and `entry` says whether the document takes a new history entry or the current one.
 */
export interface StoreAndOpenOptions {
  afterWrite?: (() => Promise<string | undefined>) | undefined;
  entry?: 'push' | 'replace' | undefined;
}

/** A write into the store: the name, the text, and whether it overwrites a stored file of that name. */
export interface StoredWrite {
  name: string;
  text: string;
  replace: boolean;
}

/**
 * Owns what the document region shows, the start page, the Visualizations table, or one document, and keeps it in step
 * with the URL and the browser's history. A stored file is read from `fileStore`, and a card's text is written into
 * it. `announce` receives each announcement. `otherKind` opens stored text of a kind that the app defines, which the
 * app stores through `storeAndOpen`; `announce` and `otherKind` keep their identity across renders. `notJsonHint` is
 * added to the problems of Upload text that is not JSON.
 */
export function useDocumentState<TOther extends OtherDocument = never>({
  fileStore,
  announce,
  otherKind,
  notJsonHint,
}: {
  fileStore: FileStore;
  announce: (text: string) => void;
  otherKind?: OtherKindHandlers<TOther> | undefined;
  notJsonHint?: string | undefined;
}): DocumentState<TOther> {
  const [shown, setShown] = useState<Shown<TOther>>(() => readLocation(0));
  const loadCount = useRef(0);
  const navigationCount = useRef(0);
  const { unknownExample, clearUnknownExample } = useUnknownExample(announce);

  // Every change of what is shown counts as a navigation, so that a stored file's read that settles later is dropped.
  const show = useCallback(
    (next: Shown<TOther>, note?: string) => {
      navigationCount.current += 1;
      setShown(next);
      const text = [describeShown(next, otherKind), note].filter((part) => part !== undefined).join(' ');
      if (text !== '') announce(text);
    },
    [announce, otherKind],
  );

  const showExample = useCallback(
    (example: Example | undefined) => {
      loadCount.current += 1;
      show(readExample(example, loadCount.current));
    },
    [show],
  );

  const showStoredFile = useCallback(
    async (name: string) => {
      navigationCount.current += 1;
      const navigation = navigationCount.current;
      setShown({ opening: name });
      const read = await fileStore.read(name);
      if (navigation !== navigationCount.current) return;
      loadCount.current += 1;
      show(readStoredFile(name, read, loadCount.current, otherKind));
    },
    [fileStore, otherKind, show],
  );

  // Read the stored file that the URL names when the page loads.
  const initialFile = useRef(shown.opening);
  useEffect(() => {
    if (initialFile.current !== undefined) void showStoredFile(initialFile.current);
    initialFile.current = undefined;
  }, [showStoredFile]);

  // Follow the browser's back and forward buttons among the start page, the Visualizations table, the examples, and the
  // documents.
  useEffect(() => {
    function handlePopState(): void {
      loadCount.current += 1;
      const next = readLocation(loadCount.current);
      if (next.opening === undefined) show(next);
      else void showStoredFile(next.opening);
    }
    globalThis.addEventListener('popstate', handlePopState);
    return () => {
      globalThis.removeEventListener('popstate', handlePopState);
    };
  }, [show, showStoredFile]);

  const chooseExample = useCallback(
    (example: Example) => {
      const search = buildExampleSearch(example);
      if (globalThis.location.search !== search) globalThis.history.pushState(null, '', search);
      clearUnknownExample();
      showExample(example);
    },
    [clearUnknownExample, showExample],
  );

  const chooseStoredFile = useCallback(
    (name: string) => {
      const search = buildFileSearch(name);
      if (globalThis.location.search !== search) globalThis.history.pushState(null, '', search);
      clearUnknownExample();
      void showStoredFile(name);
    },
    [clearUnknownExample, showStoredFile],
  );

  const isStartPage = isStartPageShown(shown);
  const openStart = useCallback(() => {
    if (!isStartPage || globalThis.location.search !== '') {
      globalThis.history.pushState(null, '', buildStartLocation());
    }
    clearUnknownExample();
    navigationCount.current += 1;
    setShown({});
  }, [clearUnknownExample, isStartPage]);

  const openVisualizations = useCallback(() => {
    const search = buildVisualizationsSearch();
    if (globalThis.location.search !== search) globalThis.history.pushState(null, '', search);
    clearUnknownExample();
    show({ view: 'visualizations' });
  }, [clearUnknownExample, show]);

  const prepareLoad = useCallback(() => {
    clearUnknownExample();
    if (shown.report === undefined) return;
    navigationCount.current += 1;
    setShown({});
  }, [clearUnknownExample, shown.report]);

  const storeAndOpen = useCallback(
    async (
      write: StoredWrite,
      fail: (failure: LoadFailure) => LoadFailure,
      buildDocument: (key: number) => OpenDocument<TOther>,
      { afterWrite, entry = 'push' }: StoreAndOpenOptions = {},
    ): Promise<LoadFailure | undefined> => {
      const navigation = navigationCount.current;
      const result = await fileStore.write(write.name, write.text, { replace: write.replace });
      if (!result.ok) {
        return fail(
          result.reason === 'exists'
            ? { kind: 'conflict', name: write.name, problems: [{ path: '', message: describeConflict(write.name) }] }
            : { kind: 'store', problems: result.problems },
        );
      }
      const note = await afterWrite?.();
      // Keep what a navigation during the write showed; the file is stored either way.
      if (navigation !== navigationCount.current) {
        if (note !== undefined) announce(note);
        return undefined;
      }
      const search = buildFileSearch(write.name);
      if (entry === 'replace') globalThis.history.replaceState(null, '', search);
      else if (globalThis.location.search !== search) globalThis.history.pushState(null, '', search);
      loadCount.current += 1;
      show({ document: buildDocument(loadCount.current) }, note);
      return undefined;
    },
    [announce, fileStore, show],
  );

  const loadText = useCallback(
    async (text: string, origin: InputOrigin, options: LoadOptions = {}): Promise<LoadFailure | undefined> => {
      prepareLoad();
      const label = labelSource(origin);
      function fail(failure: LoadFailure): LoadFailure {
        announce(describeNotLoaded(label.source, failure.problems));
        return failure;
      }
      const read = readConfigText(text, origin.kind);
      if (!read.ok) {
        const { failure } = read;
        const hint =
          failure.kind === 'not-json' && notJsonHint !== undefined ? [{ path: '', message: notJsonHint }] : [];
        return fail({ ...failure, problems: [...failure.problems, ...hint] });
      }
      const { config, value } = read;
      const name = buildStoredUploadName(origin, config);
      return storeAndOpen(
        { name, text: buildStoredUploadText(value), replace: options.replace === true },
        fail,
        (key) => buildChartDocument(name, config, key),
      );
    },
    [announce, notJsonHint, prepareLoad, storeAndOpen],
  );

  const { document, report, opening, view } = shown;

  return {
    document,
    isOpening: opening !== undefined,
    currentSlug: document !== undefined && isChartDocument(document) ? document.slug : undefined,
    currentFileName: document?.fileName,
    isVisualizationsOpen: view !== undefined,
    report,
    unknownExample,
    chooseExample,
    chooseStoredFile,
    loadText,
    openStart,
    openVisualizations,
    prepareLoad,
    storeAndOpen,
  };
}
