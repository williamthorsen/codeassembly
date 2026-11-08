import { type Example, examples } from '../../examples/examples.ts';

/** Returns the URL search string that names the example, so that a link to it can be shared. */
export function buildExampleSearch(example: Example): string {
  return `?${new URLSearchParams({ example: example.slug }).toString()}`;
}

/** Returns the bundled example that a URL search string names, or `undefined` when it names none that exists. */
export function findExampleInSearch(search: string): Example | undefined {
  const slug = new URLSearchParams(search).get('example');
  return examples.find((example) => example.slug === slug);
}

/** Returns the `example` value of a URL search string when it names no bundled example, or `undefined` otherwise. */
export function findUnknownExampleInSearch(search: string): string | undefined {
  const slug = new URLSearchParams(search).get('example');
  if (slug === null || examples.some((example) => example.slug === slug)) return undefined;
  return slug;
}
