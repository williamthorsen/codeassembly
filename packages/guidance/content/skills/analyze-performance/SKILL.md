---
name: analyze-performance
description: Measure a site's web performance as field data and lab data for mobile and desktop, diagnose the pages that fail a Core Web Vitals threshold from Lighthouse's insights and the repository, and write a findings artifact of improvements ranked by expected effect, each with its evidence, the metric that it moves, and its effort. Use when asked how well a site performs, why it is slow, or what would make it faster.
user-invocable: true
---

# Analyze performance

Report how a site performs today and which changes would make it faster. A bundled helper measures each page and reduces the runs to medians, threshold classes, field data, and the failing Lighthouse insights merged across pages; you resolve the targets, diagnose what the measurements show, inspect the repository for the causes, and rank the improvements in one findings artifact.

The skill does not write anything remote: It does not create a ticket, comment on an issue, or change a deployment. The findings artifact is the input of `triage-spike-findings`, which decides what becomes a ticket.

## Inputs

- **The targets**: one or more URLs, or the current repository, as the developer names them.
- **The private URLs**, optional: URLs that PSI must not be sent, such as a staging site.
- **The ticket**, optional. Without one in session, {skill:save-artifact} saves the artifacts under the ticket ID that it generates.

The Lighthouse CLI needs Node 22.19 or later, `pnpm`, and a local Chrome. Every helper command prints one JSON result. When a result has `ok: false`, stop and report its `error` and `message`. Invoke the helper as:

```bash
node {harness_home_dir}/skills/analyze-performance/analyze-performance.mjs {command} {flags}
```

The helper's commands, its tool-selection rule, its thresholds, and its output shapes are documented in the guidance package's `docs/analyze-performance-helper.md`.

## Tools

| Tool                                                                                  | Role                                                                                                                                 | Target                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| PageSpeed Insights API                                                                | Lab data from a remote Lighthouse run, with CrUX field data, without a key                                                           | A public URL; the helper falls back to the Lighthouse CLI when PSI refuses          |
| Lighthouse CLI                                                                        | Lab data from a local Chrome                                                                                                         | A local or preview URL, a private URL, or a public URL that PSI refused             |
| CrUX API                                                                              | Field data at the 75th percentile for the URL and the origin                                                                         | A public URL, when `CRUX_API_KEY` is set                                            |
| Lighthouse insights                                                                   | The trace-derived diagnosis in every Lighthouse report: LCP breakdown, render-blocking requests, layout-shift culprits, and the rest | Every measured page                                                                 |
| Chrome DevTools MCP server                                                            | An interactive trace of one page, for a closer look than the insights give                                                           | A page whose insights do not explain a failing metric, when the server is connected |
| The framework's bundle analyzer, or `source-map-explorer` through an ephemeral runner | The modules that dominate shipped JavaScript                                                                                         | The repository's production build                                                   |
| `curl --head`                                                                         | Caching, compression, and protocol headers                                                                                           | The production URL, or the local server labelled as local                           |

WebPageTest and sitespeed.io are out of scope: They need a key or a hosted account, and the tools above measure what the findings rank on.

## Process

### 1. Prepare

Resolve the ticket directory per {skill:save-artifact}, and create `{ticket_dir}/performance/`. Read the declared stage from `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs`. When `project_sensitivity` is `personal` or `confidential`, pass every URL that is not publicly reachable as `--private`, so that it is never sent to PSI.

### 2. Resolve the targets

For a repository target:

- **The local build.** Build and serve it by the repository's own production build and serve scripts, such as `build` then `start` or `preview`. Never measure a dev server, whose unminified, unbundled output misreports every metric. When the repository does not have a serve script, serve the build output with a static file server through an ephemeral runner.
- **The production URL.** When the developer did not name one, look for it in the repository's declarations: a framework's site setting (such as Next.js `metadataBase` or Astro's `site`), a sitemap configuration, `homepage` in `package.json`, a GitHub Pages `CNAME`, or the domains of a linked Vercel project. Record the URL with the file that declares it. When none is declared, measure the local build now and ask for the production URL at the checkpoint.

Then choose the pages: one per template, from the sitemap or the routes, at most six unless the developer names more. Record each choice with its template. Pass as `--private` every URL that the developer marks private, every preview deployment URL, and every URL whose page requires sign-in; the helper's host rule covers local addresses.

### 3. Measure

Run `collect` with every chosen URL, then `summarize`:

```bash
node {harness_home_dir}/skills/analyze-performance/analyze-performance.mjs collect \
  --url {url} [--url {url}]... [--private {url}]... --out {ticket_dir}/performance/raw/
node {harness_home_dir}/skills/analyze-performance/analyze-performance.mjs summarize --in {ticket_dir}/performance/raw/
```

Save the summary as `{ticket_dir}/performance/summary.json`. `collect` reaches the hosts that the helper doc lists; when the sandbox refuses one, retry through the permission gate rather than measuring less. A page's `fallbackReason` and every line of the summary's `unmeasured` go into the artifact's **Unmeasured** section as they stand.

### 4. Diagnose

For each page and form factor, take each metric classed `poor` or `needs-improvement`, in field data first and lab data otherwise, and find its causes:

- **Insights.** Read the merged insights whose `savings` name the metric. Open the raw report that an insight's `files` names when the summary does not give enough detail, such as the LCP element or the subparts of the LCP breakdown.
- **The repository**, when one is in scope. Trace each culprit resource to the source that produces it: a bundle to its dominant modules through the bundle analyzer, an image or a font to where the code loads it and how, and a response to the headers that the server or the hosting configuration sets. Name each source by its path relative to the repository root.
- **A trace**, when the Chrome DevTools MCP server is connected and a failing metric's insights do not account for it. Record what the trace shows; when the server is not connected, record the gap under **Unmeasured**.

Lab TBT stands in for INP, which only field data measures: Report it as a proxy, never as INP.

### 5. Compose the findings

Write the findings document with these sections, in this order:

1. **Summary.** One table per page of field data, at URL and origin level for each form factor, and one of lab data, with each metric's value and class. Never merge the two: Field data is what real users met, and lab data is one simulated device. State each page's field-data source, or that field data is unavailable and why.
2. **Improvements.** One entry per change, each with:
   - its title;
   - its evidence: the insight ids and culprits, the raw files relative to `{ticket_dir}`, and the repository paths;
   - the metric that it is expected to move, the pages and form factors on which that metric fails, and the expected effect, taken from the insight's estimated saving where one exists;
   - its effort, with its reason: `S` for one file or setting, `M` for several files in one area, `L` for a cross-cutting change or one that needs a design decision.

   Rank the improvements by the class of the metric that each moves, `poor` before `needs-improvement`, then by estimated saving in the metric's own unit (milliseconds for LCP, FCP, and TBT; the shift score for CLS), then by the number of pages. A byte saving breaks a remaining tie only. An improvement drawn from the repository alone, without an insight, ranks after the insight-backed ones of its class. An improvement that the insights of one page alone support says so.

3. **Unmeasured.** What each missing key, missing production URL, private target, failed run, and unconnected tool left out. When the production URL is unknown, state that field data and production delivery (CDN caching, compression, and time to first byte) were not measured.
4. **Method.** The tools with the Lighthouse version, the runs per form factor, each page with its template and its tool, the build and serve commands for a local target, and the date.

### 6. Checkpoint

Save the document with {skill:save-artifact} as a ticket-level `performance-findings` artifact, and present the summary tables and the ranked improvements. Ask in one action-items block for approval of the findings, and for the production URL when step 2 did not find one. When the developer supplies a URL, measure it as in step 3, revise the findings, and save the revision before asking again. Revise the ranking on the developer's feedback.

<!-- include: ../_partials/action-items.md / -->

### 7. Report

Once the developer approves the findings, give the artifact's path and one line of counts: pages measured, metrics failing by class, and improvements by effort. Name {skill:triage-spike-findings} as the next step, with the artifact's path as its input.
