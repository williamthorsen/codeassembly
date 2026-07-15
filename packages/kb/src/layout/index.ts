// Subpath barrel for @codeassembly/kb/layout.
//
// The single owner of the store's on-disk layout. Every site that creates, resolves, or inspects a path inside a store
// derives it from here, so the layout has one definition rather than a convention re-declared at each call site.

export {
  ALIASES_FILE,
  ASSERTIONS_DIR,
  ASSERTIONS_SEGMENT,
  buildEventPath,
  CONFIG_FILE,
  CONTENT_DIR,
  EVENTS_DIR,
  KB_DIR,
  resolveAssertionsDir,
  resolveEventPath,
  resolveEventsDir,
  resolveKbDir,
} from './store-layout.ts';
