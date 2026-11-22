/** Returns the URL search string that names a stored file, and nothing else, so that a link to it can be shared. */
export function buildFileSearch(name: string): string {
  return `?${new URLSearchParams({ [FILE_PARAMETER]: name }).toString()}`;
}

/** Returns the URL of the start page: the page's path without a search string. */
export function buildStartLocation(): string {
  return globalThis.location.pathname;
}

/** Returns the URL search string that names the Visualizations table. */
export function buildVisualizationsSearch(): string {
  return `?${new URLSearchParams({ [VIEW_PARAMETER]: VISUALIZATIONS_VIEW }).toString()}`;
}

/** Returns the stored file that a URL search string names, or `undefined` when it names none. */
export function findFileInSearch(search: string): string | undefined {
  const name = new URLSearchParams(search).get(FILE_PARAMETER);
  return name === null || name === '' ? undefined : name;
}

/** Reports whether a URL search string names the Visualizations table. */
export function isVisualizationsSearch(search: string): boolean {
  return new URLSearchParams(search).get(VIEW_PARAMETER) === VISUALIZATIONS_VIEW;
}

// region | Helpers
const FILE_PARAMETER = 'file';

const VIEW_PARAMETER = 'view';

const VISUALIZATIONS_VIEW = 'visualizations';
// endregion | Helpers
