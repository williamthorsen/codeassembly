import { useEffect } from 'react';

const PAGE_TITLE = 'Agent logic';

/** Names the shown chart's source in the document title, so that tabs and history entries can be told apart. */
export function useDocumentTitle(source: string | undefined): void {
  useEffect(() => {
    document.title = source === undefined ? PAGE_TITLE : `${source} – ${PAGE_TITLE}`;
  }, [source]);
}
