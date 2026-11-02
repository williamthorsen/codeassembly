# Performance helper

`src/analyze-performance/` contains the helper that the `analyze-performance` skill runs, bundled to `content/skills/analyze-performance/analyze-performance.mjs`. It measures each URL with the PageSpeed Insights (PSI) API or the Lighthouse CLI, writes every raw response with a manifest, and reduces that directory to medians, threshold classes, field data, and the failing Lighthouse insights merged across pages. It does not write anything remote.

## Commands

Every command prints one JSON result to stdout. A result has `ok: true` and the command's fields, or `ok: false` with an `error` code and a `message`, in which case the command exits 1. A value-bearing flag accepts both `--flag value` and `--flag=value`; `--url` and `--private` may be repeated, and every other flag may be given once.

```bash
analyze-performance.mjs collect --url <url>... [--private <url>]... [--runs <n>] --out <dir>
analyze-performance.mjs summarize --in <dir>
```

- **`collect`** measures every `--url` in the mobile and desktop form factors, `--runs` times each (3 by default, at most 10), and writes the [run directory](#the-run-directory) to `--out`. It reports `out`, `manifest`, and `pages`, each with its `url`, `slug`, `tool`, `fallbackReason`, `fieldSource`, `fieldUnavailableReason`, `runsSucceeded`, and distinct `errors`. A failure on one URL is recorded on its runs, and `collect` continues with the next URL; the command fails only on invalid arguments or when every run of every URL failed.
- **`summarize`** reads the run directory at `--in` through its manifest and reports the [summary](#the-summary).

The error codes are `command-failed`, `input-not-found`, `invalid-args`, `invalid-input`, `lighthouse-failed`, and `psi-failed`. `lighthouse-failed` and `psi-failed` report that every run failed, with every run's error in the message: `lighthouse-failed` when any page was measured by the Lighthouse CLI, `psi-failed` otherwise.

## Tool selection

`select-tool.ts` defines the rule. A URL passed as `--private`, or one on a loopback, private, or link-local address, or on a `localhost`, `.local`, `.localhost`, or `.internal` host, is measured by the Lighthouse CLI alone. Every other URL is measured by PSI, without a key, until a PSI failure falls back: a 429, a 5xx, a request that does not complete, or a PSI error that reports the page unreachable. The first such failure switches the whole page to the Lighthouse CLI, so that every run of a page comes from one tool, and the page's `fallbackReason` states why. Any other PSI failure is recorded on its run without a fallback.

The Lighthouse CLI runs as `pnpm dlx lighthouse@{version}`, with the version pinned by `LIGHTHOUSE_VERSION` in `collect.ts`. It needs `pnpm`, Node 22.19 or later, and a local Chrome; when any of them is missing, or pnpm refuses to install the pinned release, each run records the CLI's error. The desktop form factor adds `--preset=desktop`.

## Field data

`CRUX_API_KEY` is the one credential that the helper reads. When it is set and the page is public, `collect` queries the CrUX API for the URL and its origin in both form factors; a 404, by which the API reports too little traffic, is recorded as a missing record. Without the key, field data comes from the CrUX block of the first successful PSI run of each form factor. A private page, or a page measured by the Lighthouse CLI without the key, has no field data, and `fieldUnavailableReason` states why. When the CrUX API fails and PSI supplied field data, the PSI data is used and the reason records the API failure.

## Hosts

`collect` reaches `www.googleapis.com` for PSI, `chromeuxreport.googleapis.com` for the CrUX API, the npm registry through `pnpm dlx`, and each measured URL through Lighthouse's Chrome.

## The run directory

```
{out}/
├── manifest.json
└── {page-slug}/
    ├── {form-factor}-{run}.psi.json          ← a PSI response, whose lighthouseResult is a Lighthouse report
    ├── {form-factor}-{run}.lighthouse.json   ← a Lighthouse report from the CLI
    └── crux-{form-factor}.json               ← the CrUX API records for the URL and the origin, when the key is set
```

A page's slug is its host and path in kebab case, suffixed with `-2`, `-3`, and so on when an earlier URL took it. `manifest.json` is defined by `ManifestSchema` in `schemas.ts`: the creation time, the Lighthouse version, the runs per form factor, and each page with its tool, fallback reason, field-data source and reason, CrUX files, and runs, each with its form factor, index, file, and error. `summarize` reads only the files that the manifest names.

## The summary

```ts
interface Summary {
  createdAt: string;
  lighthouseVersion: string;
  pages: Array<{
    url: string;
    slug: string;
    tool: 'psi' | 'lighthouse';
    fallbackReason: string | null;
    field: {
      source: 'crux-api' | 'psi' | null;
      unavailableReason: string | null;
      byFormFactor: Record<'mobile' | 'desktop', { url: FieldValues | null; origin: FieldValues | null }>;
    };
    lab: Record<'mobile' | 'desktop', LabRow>;
  }>;
  insights: MergedInsight[];
  unmeasured: string[];
}
```

- **Lab rows.** Each `LabRow` contains `runsSucceeded`, `errors`, and `metrics`: for LCP, CLS, TBT, FCP, and Speed Index, the median across successful runs as `value`, each run's value as `values`, and the median's `class`. A row with fewer than 2 successful runs is `insufficientRuns`; its insights are not merged, and `unmeasured` lists it.
- **Field values.** The 75th percentile of LCP, INP, and CLS at URL and origin level, each with its `class`.
- **Classes.** `thresholds.ts` defines them: `good`, `needs-improvement`, or `poor` against the Core Web Vitals thresholds for LCP, INP, and CLS, web.dev's thresholds for FCP, and Lighthouse's mobile scoring bands for TBT, which carries `proxyFor: 'inp'` because lab data cannot measure INP. Speed Index has a `class` of null.
- **Merged insights.** Every Lighthouse `*-insight` audit that a run scores below 0.9 or that estimates a saving, excluding those marked not applicable, manual, or errored, merged across pages and form factors by insight id and culprit resource. A culprit is a URL named in the audit's details, without its query string and fragment; an insight that does not name one merges by id alone. Each entry contains `id`, `title`, `culprit`, `occurrences` (each page slug and form factor), `savings` (per metric, the largest across occurrences of each occurrence's median across its runs, in milliseconds except CLS), and `files`, the raw files that reported it. The list is ordered by the largest millisecond saving.
- **Unmeasured.** One line per row with too few runs and per page without full field data, with the reason.
