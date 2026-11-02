/** Measures each URL with PSI or the Lighthouse CLI, and writes every raw response and the run manifest. */
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { readPsiField } from './normalize.ts';
import {
  type CruxFile,
  CruxRecordSchema,
  FORM_FACTORS,
  LighthouseReportSchema,
  type Manifest,
  type ManifestPage,
  type ManifestRun,
  PsiResponseSchema,
} from './schemas.ts';
import { type PsiFailure, readFallbackReason, selectTool } from './select-tool.ts';

/**
 * The Lighthouse release that the helper runs, at least 24 hours old when pinned. The normalizer reads the insight
 * audit ids of Lighthouse 13, so a new major version needs its fixtures re-captured.
 */
export const LIGHTHOUSE_VERSION = '13.6.0';

/** The number of lab runs per page and form factor when `--runs` is not given. */
export const DEFAULT_RUNS = 3;

/** The environment variable that holds the CrUX API key, the one credential that the helper reads. */
export const CRUX_KEY_VARIABLE = 'CRUX_API_KEY';

/** The services that `collect` reaches, injected so that tests can supply fixtures. */
export interface CollectDependencies {
  /** Fetches a URL and resolves with its status and parsed JSON body, rejecting when the request does not complete. */
  fetchJson: (url: string, init?: { body: string; method: 'POST' }) => Promise<{ status: number; body: unknown }>;
  /** Runs `pnpm` in `cwd` and resolves with its stdout, rejecting when the command fails. */
  runPnpm: (args: readonly string[], cwd: string) => Promise<string>;
  /** Returns the CrUX API key, or undefined when it is not set. */
  readCruxKey: () => string | undefined;
  now: () => Date;
}

/** What `collect` measures and where it writes. */
export interface CollectOptions {
  urls: readonly string[];
  privateUrls: ReadonlySet<string>;
  runs: number;
  out: string;
  /** The directory from which `pnpm dlx` runs, so that the measured project's pnpm settings, its trust policy among them, apply. */
  cwd: string;
}

/** Real dependencies: the global `fetch`, `pnpm` through `execFile`, and `CRUX_API_KEY` from the environment. */
export const realCollectDependencies: CollectDependencies = {
  fetchJson: async (url, init) => {
    const response = await fetch(
      url,
      init === undefined ? undefined : { ...init, headers: { 'content-type': 'application/json' } },
    );
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // Keep the text: An HTML error page from a proxy is reported as PSI's message.
    }
    return { status: response.status, body };
  },
  runPnpm: async (args, cwd) => {
    const { stdout } = await execFileAsync('pnpm', [...args], { cwd, maxBuffer: 64 * 1_024 * 1_024 });
    return stdout;
  },
  readCruxKey: () => process.env[CRUX_KEY_VARIABLE] || undefined,
  now: () => new Date(),
};

/** Measures every URL in both form factors, writes the raw files and `manifest.json` under `out`, and returns the manifest. */
export async function collect(options: CollectOptions, dependencies: CollectDependencies): Promise<Manifest> {
  mkdirSync(options.out, { recursive: true });
  const cruxKey = dependencies.readCruxKey();
  const slugs = new Set<string>();
  const pages: ManifestPage[] = [];
  for (const url of options.urls) {
    const slug = buildUniqueSlug(url, slugs);
    mkdirSync(path.join(options.out, slug), { recursive: true });
    pages.push(await collectPage(url, slug, options, cruxKey, dependencies));
  }
  const manifest: Manifest = {
    version: 1,
    createdAt: dependencies.now().toISOString(),
    lighthouseVersion: LIGHTHOUSE_VERSION,
    runsPerFormFactor: options.runs,
    pages,
  };
  writeFileSync(path.join(options.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

const CRUX_ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';

const CRUX_FORM_FACTORS: Readonly<Record<FormFactor, string>> = { desktop: 'DESKTOP', mobile: 'PHONE' };

const execFileAsync = promisify(execFile);

// region | Helpers

type FormFactor = (typeof FORM_FACTORS)[number];

/** Derives a file-safe slug from a URL's host and path, suffixed when an earlier URL took the same slug. */
function buildUniqueSlug(url: string, taken: Set<string>): string {
  const parsed = new URL(url);
  const base =
    `${parsed.host}${parsed.pathname}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'page';
  let slug = base;
  for (let suffix = 2; taken.has(slug); suffix += 1) slug = `${base}-${suffix}`;
  taken.add(slug);
  return slug;
}

/**
 * Measures one page: PSI first for a public URL, switching the whole page to the Lighthouse CLI on the first PSI
 * failure that falls back, so that every run of a page comes from one tool. Field data comes from the CrUX API when a
 * key is set, and otherwise from the first successful PSI run of each form factor.
 */
async function collectPage(
  url: string,
  slug: string,
  options: CollectOptions,
  cruxKey: string | undefined,
  dependencies: CollectDependencies,
): Promise<ManifestPage> {
  const isPrivate = selectTool(url, options.privateUrls) === 'lighthouse';
  if (isPrivate) return collectWithLighthouse(url, slug, true, null, options, cruxKey, dependencies);

  const runs: ManifestRun[] = [];
  const psiField: Partial<Record<FormFactor, boolean>> = {};
  for (const formFactor of FORM_FACTORS) {
    for (let index = 1; index <= options.runs; index += 1) {
      const result = await runPsi(url, slug, formFactor, index, options.out, dependencies);
      if (result.kind === 'ok') {
        runs.push({ formFactor, index, file: result.file, error: null });
        psiField[formFactor] ||= result.hasField;
        continue;
      }
      const reason = readFallbackReason(result.failure);
      if (reason !== null) return collectWithLighthouse(url, slug, false, reason, options, cruxKey, dependencies);
      runs.push({ formFactor, index, file: null, error: `PSI failed: ${result.failure.message}` });
    }
  }
  const field = await collectField(url, slug, false, 'psi', psiField, options.out, cruxKey, dependencies);
  return { url, slug, private: false, tool: 'psi', fallbackReason: null, ...field, runs };
}

/** Measures one page with the Lighthouse CLI alone, recording why PSI did not measure it. */
async function collectWithLighthouse(
  url: string,
  slug: string,
  isPrivate: boolean,
  fallbackReason: string | null,
  options: CollectOptions,
  cruxKey: string | undefined,
  dependencies: CollectDependencies,
): Promise<ManifestPage> {
  const runs: ManifestRun[] = [];
  for (const formFactor of FORM_FACTORS) {
    for (let index = 1; index <= options.runs; index += 1) {
      runs.push(await runLighthouse(url, slug, formFactor, index, options, dependencies));
    }
  }
  const field = await collectField(url, slug, isPrivate, 'lighthouse', {}, options.out, cruxKey, dependencies);
  return { url, slug, private: isPrivate, tool: 'lighthouse', fallbackReason, ...field, runs };
}

/** Decides where the page's field data comes from, calling the CrUX API when a key is set and the page is public. */
async function collectField(
  url: string,
  slug: string,
  isPrivate: boolean,
  tool: ManifestPage['tool'],
  psiField: Partial<Record<FormFactor, boolean>>,
  out: string,
  cruxKey: string | undefined,
  dependencies: CollectDependencies,
): Promise<Pick<ManifestPage, 'crux' | 'fieldSource' | 'fieldUnavailableReason'>> {
  const crux: Record<FormFactor, string | null> = { desktop: null, mobile: null };
  if (isPrivate) {
    return { crux, fieldSource: null, fieldUnavailableReason: 'the URL is private, so CrUX has no data for it' };
  }
  if (cruxKey !== undefined) {
    const errors: string[] = [];
    for (const formFactor of FORM_FACTORS) {
      try {
        const file = await fetchCrux(url, formFactor, cruxKey, dependencies);
        const relative = path.join(slug, `crux-${formFactor}.json`);
        writeFileSync(path.join(out, relative), `${JSON.stringify(file, null, 2)}\n`, 'utf8');
        crux[formFactor] = relative;
      } catch (error) {
        errors.push(`${formFactor}: ${describeError(error)}`);
      }
    }
    if (errors.length === 0) return { crux, fieldSource: 'crux-api', fieldUnavailableReason: null };
    if (tool === 'psi' && FORM_FACTORS.some((formFactor) => psiField[formFactor] === true)) {
      return { crux, fieldSource: 'psi', fieldUnavailableReason: `CrUX API failed (${errors.join('; ')})` };
    }
    return { crux, fieldSource: null, fieldUnavailableReason: `CrUX API failed (${errors.join('; ')})` };
  }
  if (tool === 'lighthouse') {
    return {
      crux,
      fieldSource: null,
      fieldUnavailableReason: `PSI did not measure the page and ${CRUX_KEY_VARIABLE} is not set`,
    };
  }
  if (FORM_FACTORS.every((formFactor) => psiField[formFactor] !== true)) {
    return {
      crux,
      fieldSource: null,
      fieldUnavailableReason: 'CrUX has too little traffic for the URL and its origin',
    };
  }
  return { crux, fieldSource: 'psi', fieldUnavailableReason: null };
}

/** Queries the CrUX API for the URL and its origin; a 404 means too little traffic and yields a null record. */
async function fetchCrux(
  url: string,
  formFactor: FormFactor,
  key: string,
  dependencies: CollectDependencies,
): Promise<CruxFile> {
  return {
    url: await queryCrux({ url }, formFactor, key, dependencies),
    origin: await queryCrux({ origin: new URL(url).origin }, formFactor, key, dependencies),
  };
}

/** Queries one CrUX API record, returning null on the 404 by which the API reports too little traffic. */
async function queryCrux(
  target: { origin: string } | { url: string },
  formFactor: FormFactor,
  key: string,
  dependencies: CollectDependencies,
): Promise<CruxFile['url']> {
  const body = JSON.stringify({ ...target, formFactor: CRUX_FORM_FACTORS[formFactor] });
  const response = await dependencies.fetchJson(`${CRUX_ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    body,
  });
  if (response.status === 404) return null;
  if (response.status !== 200) throw new Error(`HTTP ${response.status}: ${readErrorMessage(response.body)}`);
  return CruxRecordSchema.parse(response.body);
}

/** Reads the message of a Google API error body, or the body itself when it is text. */
function readErrorMessage(body: unknown): string {
  if (typeof body === 'string') return body.slice(0, 200);
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const error = body.error;
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      return error.message;
    }
  }
  return 'unrecognized error body';
}

/** Runs the pinned Lighthouse CLI once and records the run, failed when the CLI fails or reports a runtime error. */
async function runLighthouse(
  url: string,
  slug: string,
  formFactor: FormFactor,
  index: number,
  { out, cwd }: CollectOptions,
  dependencies: CollectDependencies,
): Promise<ManifestRun> {
  const relative = path.join(slug, `${formFactor}-${index}.lighthouse.json`);
  const args = [
    'dlx',
    `lighthouse@${LIGHTHOUSE_VERSION}`,
    url,
    '--only-categories=performance',
    '--output=json',
    `--output-path=${path.join(out, relative)}`,
    '--chrome-flags=--headless=new',
    '--quiet',
    ...(formFactor === 'desktop' ? ['--preset=desktop'] : []),
  ];
  try {
    await dependencies.runPnpm(args, cwd);
  } catch (error) {
    return { formFactor, index, file: null, error: `Lighthouse CLI failed: ${describeError(error)}` };
  }
  try {
    const report = LighthouseReportSchema.parse(JSON.parse(readFileSync(path.join(out, relative), 'utf8')));
    if (report.runtimeError !== undefined) {
      const message = report.runtimeError.message ?? report.runtimeError.code;
      return { formFactor, index, file: relative, error: `Lighthouse runtime error: ${message}` };
    }
  } catch (error) {
    return { formFactor, index, file: null, error: `Lighthouse wrote no readable report: ${describeError(error)}` };
  }
  return { formFactor, index, file: relative, error: null };
}

/** Calls PSI once and writes the response, or reports the failure for the caller to decide on a fallback. */
async function runPsi(
  url: string,
  slug: string,
  formFactor: FormFactor,
  index: number,
  out: string,
  dependencies: CollectDependencies,
): Promise<{ kind: 'ok'; file: string; hasField: boolean } | { kind: 'failed'; failure: PsiFailure }> {
  const query = new URLSearchParams({ url, strategy: formFactor, category: 'performance' });
  let response;
  try {
    response = await dependencies.fetchJson(`${PSI_ENDPOINT}?${query.toString()}`);
  } catch (error) {
    return { kind: 'failed', failure: { kind: 'network', message: describeError(error) } };
  }
  if (response.status !== 200) {
    return {
      kind: 'failed',
      failure: { kind: 'http', status: response.status, message: readErrorMessage(response.body) },
    };
  }
  const parsed = PsiResponseSchema.safeParse(response.body);
  const report = parsed.success ? LighthouseReportSchema.safeParse(parsed.data.lighthouseResult) : undefined;
  if (!parsed.success || report?.success !== true) {
    return { kind: 'failed', failure: { kind: 'http', status: 200, message: 'PSI returned no Lighthouse report' } };
  }
  const runtimeError = report.data.runtimeError;
  if (runtimeError !== undefined) {
    const message = `${runtimeError.code}${runtimeError.message === undefined ? '' : `: ${runtimeError.message}`}`;
    return { kind: 'failed', failure: { kind: 'http', status: 200, message } };
  }
  const relative = path.join(slug, `${formFactor}-${index}.psi.json`);
  writeFileSync(path.join(out, relative), `${JSON.stringify(response.body)}\n`, 'utf8');
  const hasField =
    readPsiField(parsed.data.loadingExperience, 'url') !== null ||
    readPsiField(parsed.data.originLoadingExperience, 'origin') !== null;
  return { kind: 'ok', file: relative, hasField };
}

// endregion | Helpers
