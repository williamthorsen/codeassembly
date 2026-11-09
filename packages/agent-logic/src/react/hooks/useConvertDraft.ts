import { useCallback, useRef, useState } from 'react';

/** The convert dialog's starting name and prompt; `key` changes with each opening, so that the dialog starts afresh. */
export interface ConvertDraft {
  key: number;
  name: string;
  prompt: string;
}

/** The open convert dialog's draft, with functions that open the dialog afresh and close it. */
export interface ConvertDraftControls {
  draft: ConvertDraft | undefined;
  /** Opens the dialog, starting with the name and the prompt given, if any. */
  open: (initial?: { name: string; prompt: string }) => void;
  close: () => void;
}

/** Holds the convert dialog's open state, so that the header and the saved-files list can both open it. */
export function useConvertDraft(): ConvertDraftControls {
  const [draft, setDraft] = useState<ConvertDraft | undefined>();
  const openCount = useRef(0);
  const open = useCallback((initial?: { name: string; prompt: string }) => {
    openCount.current += 1;
    setDraft({ key: openCount.current, name: initial?.name ?? '', prompt: initial?.prompt ?? '' });
  }, []);
  const close = useCallback(() => setDraft(undefined), []);
  return { draft, open, close };
}
