/** Mapping from artifact type to pastel display color. */
export const ARTIFACT_COLORS = {
  reqs: '#dee2e6',
  xplan: '#d0ebff',
  arch: '#a5d8ff',
  plan: '#b2f2bb',
  code: '#fff3bf',
  review: '#ffc9c9',
  fixes: '#ffe8cc',
  clean: '#f3d9fa',
  holi: '#c3fae8',
  summary: '#f8f9fa',
} as const;

export type ArtifactColorKey = keyof typeof ARTIFACT_COLORS;
