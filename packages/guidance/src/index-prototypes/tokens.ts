export const THEME_NAMES = ['dark', 'light'] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

export const TOKEN_NAMES = [
  'accent',
  'chip',
  'control-border',
  'on-accent',
  'page',
  'reject-bg',
  'reject-text',
  'surface',
  'text',
  'text-muted',
  'winner-bg',
  'winner-border',
  'winner-text',
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];

/** A foreground token that the page sets on a background token, with the contrast ratio that the pair must meet. */
export interface TokenPairing {
  foreground: TokenName;
  background: TokenName;
  minimumRatio: number;
}

/** The index page's colours, rendered as CSS custom properties named after each token. */
export const THEME_TOKENS: Record<ThemeName, Record<TokenName, string>> = {
  dark: {
    accent: '#8cb6ff',
    chip: '#2a2f39',
    'control-border': '#8790a3',
    'on-accent': '#0b1730',
    page: '#111317',
    'reject-bg': '#3f1717',
    'reject-text': '#ffb8b8',
    surface: '#1b1e25',
    text: '#e7e9ee',
    'text-muted': '#b0b6c3',
    'winner-bg': '#3b2d06',
    'winner-border': '#d9a43a',
    'winner-text': '#ffd98a',
  },
  light: {
    accent: '#1d5bbf',
    chip: '#e9ecf1',
    'control-border': '#6b7385',
    'on-accent': '#ffffff',
    page: '#f4f5f7',
    'reject-bg': '#fbe4e4',
    'reject-text': '#8f1d1d',
    surface: '#ffffff',
    text: '#1b1f27',
    'text-muted': '#4a5160',
    'winner-bg': '#fff1c9',
    'winner-border': '#a06c00',
    'winner-text': '#5c3d00',
  },
};

/**
 * Every pair of tokens that the page's styles set together. Text pairs take the 4.5:1 floor for body text; the
 * borders and focus ring that identify a control or a state take the 3:1 floor for non-text contrast.
 */
export const CONTRAST_PAIRINGS: readonly TokenPairing[] = [
  { foreground: 'accent', background: 'page', minimumRatio: 3 },
  { foreground: 'accent', background: 'surface', minimumRatio: 4.5 },
  { foreground: 'control-border', background: 'surface', minimumRatio: 3 },
  { foreground: 'on-accent', background: 'accent', minimumRatio: 4.5 },
  { foreground: 'reject-text', background: 'reject-bg', minimumRatio: 4.5 },
  { foreground: 'text', background: 'chip', minimumRatio: 4.5 },
  { foreground: 'text', background: 'page', minimumRatio: 4.5 },
  { foreground: 'text', background: 'surface', minimumRatio: 4.5 },
  { foreground: 'text-muted', background: 'chip', minimumRatio: 4.5 },
  { foreground: 'text-muted', background: 'page', minimumRatio: 4.5 },
  { foreground: 'text-muted', background: 'surface', minimumRatio: 4.5 },
  { foreground: 'winner-border', background: 'surface', minimumRatio: 3 },
  { foreground: 'winner-text', background: 'winner-bg', minimumRatio: 4.5 },
];

/** Renders a theme's tokens as CSS custom-property declarations. */
export function renderTokenDeclarations(theme: ThemeName): string {
  return TOKEN_NAMES.map((name) => `--${name}: ${THEME_TOKENS[theme][name]};`).join(' ');
}
