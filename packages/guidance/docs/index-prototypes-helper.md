# Prototype index helper

`src/index-prototypes/` contains the helper that the `index-prototypes` skill runs, bundled to `content/skills/index-prototypes/index-prototypes.mjs`. It keeps a prototype set's manifest, including the set's summary and each prototype's notes, stores the set's screenshots, and renders the set's index page. It does not publish anything: The skill publishes the page with the Artifact tool and reads its verdicts with ArtifactData.

## Commands

Every command prints one JSON result to stdout. A result has `ok: true` and the command's fields, or `ok: false` with an `error` code and a `message`, in which case the command exits 1. A value-bearing flag accepts both `--flag value` and `--flag=value`.

```bash
index-prototypes.mjs resolve-ids --set-dir <dir> --slugs <a,b,...>
index-prototypes.mjs register --set-dir <dir> --slug <slug> --title <text> --url <url> [--number <n>] [--set-title <text>] [--source <path>] [--lens <text>] [--inputs <a,b,...>] [--description <text>] [--note <label: value>]... [--screenshot <png>]
index-prototypes.mjs describe-set --set-dir <dir> --file <json>
index-prototypes.mjs record-index --set-dir <dir> --url <url>
index-prototypes.mjs render --set-dir <dir> --out <file>
```

- **`resolve-ids`** returns, without writing, the id that the next registration of each slug in `--slugs` takes, in the order given: `ids`, a list of `{ slug, number, version, id }`, in which `id` is `{number}.{version}`. A registered slug keeps its number and takes its next version; each new slug takes the next number past the set's highest, in the order given, which is what registering the slugs in that order assigns. It runs before a set has a manifest. `--slugs` is split on commas, and a slug named twice is `invalid-args`.
- **`register`** appends an entry to the set's manifest, creating the manifest on the set's first registration, which requires `--set-title`. A later `--set-title` renames the set. The entry's `version` is 1 for a new slug and one past the slug's highest version otherwise. Its `number` is one past the set's highest number for a new slug and the slug's existing number otherwise, so every version of a slug shares one number. `--number` asserts the number that `resolve-ids` gave the slug: A new slug takes it when the number is not already assigned to another slug, a registered slug must already have it, and either failure is `number-conflict`, as is a value that is not a positive integer. The entry's `registeredAt` is the UTC time of the call. `--inputs` is split on commas, and each item is trimmed. `--source` is recorded as given, not copied. `--note` may be repeated; each is split at its first colon into a trimmed `label` and `value`, both of which must be non-empty, and the entry's `notes` keep the order given. `--url` must be an http or https URL. The result contains `manifestPath` and the new `entry`.
- **`describe-set`** replaces the manifest's `summary` with the one in the JSON file at `--file`, and requires a manifest, which the first `register` creates. The file contains `shared`, a non-empty string; `changes`, a string or `null`, which may be omitted; and `try`, a list of non-empty strings, which may be empty. Every string is trimmed, and an omitted or blank `changes` is stored as `null`. The result contains `manifestPath` and the stored `summary`.
- **`record-index`** stores the published index page's URL as the manifest's `indexUrl`, which later registrations keep. The result contains `manifestPath` and `indexUrl`.
- **`render`** writes the index page to `--out`. The result contains `path`, `bytes`, `cards`, `title`, `indexUrl`, `missingShots` (slugs whose recorded screenshot is missing from disk), and a `warning` when the page exceeds 12,000,000 bytes. Above 16,000,000 bytes, the artifact page cap, `render` writes nothing and returns `page-too-large`.

The error codes are `invalid-args`, `invalid-manifest`, `invalid-slug`, `invalid-summary`, `invalid-url`, `manifest-not-found`, `missing-set-title`, `not-png`, `number-conflict`, `page-too-large`, `screenshot-not-found`, and `summary-not-found`.

## Slugs

A slug matches `[a-z0-9][a-z0-9-]{0,39}`, so that it serves as a file stem and as a `db` document id unchanged.

## Manifest

`manifest.json` in the set directory, written through a sibling temporary file and a rename:

```json
{
  "title": "Header variants",
  "indexUrl": "https://claude.ai/artifact/…",
  "summary": {
    "shared": "Same screens and data, in both themes.",
    "changes": null,
    "try": ["Find the settings menu.", "Collapse the toolbar."]
  },
  "entries": [
    {
      "slug": "dense",
      "number": 1,
      "version": 1,
      "registeredAt": "2026-10-03T01:19:36.000Z",
      "title": "Dense header",
      "url": "https://claude.ai/artifact/…",
      "source": "/…/prototypes/dense-v1.html",
      "lens": "information density",
      "inputs": ["ticket", "sketch"],
      "description": "Packs the toolbar into one row.",
      "notes": [{ "label": "Search", "value": "In the toolbar" }],
      "shot": "shots/dense-v1.png"
    }
  ]
}
```

`indexUrl`, `summary`, `source`, `lens`, `description`, and `shot` are `null` when absent, and `notes` is empty. `register` and `record-index` keep the summary. Every registration stays in `entries`; the page shows the highest version of each slug, in order of the slug's first registration. A manifest whose entries lack `number`, written before numbers existed, reads as numbered in order of each slug's first registration. A manifest without `summary` reads with `null`, and an entry without `notes` with an empty list. `register`, `describe-set`, and `record-index` write these fields at their next write, and `render` writes nothing. A `number` that is present must be a positive integer, or the manifest is `invalid-manifest`.

`render` shows the placeholder for a registration without `--screenshot` even when an earlier version had a screenshot, since that screenshot shows the earlier version.

## Screenshots

`--screenshot` must be a PNG file. The helper stores it unchanged as `shots/{slug}-v{version}.png`, and `render` embeds each stored screenshot as a `data:image/png;base64` URI. The skill captures at 1280×800 CSS pixels, which the page shows in cards at least 480px wide.

## Index page

The page is Artifact page content: `<title>` and `<style>` first, without a document wrapper. Below the title, the summary renders as a definition list of "Shared", "Changed in this round", and "Try in each", the last as a numbered list; a part that is `null` or empty is left out. Each card renders its notes as a definition list, in the order stored. Its colours are the tokens in `tokens.ts`, declared for the light theme, the dark scheme, and an explicit `data-theme="dark"`; `tokens-contrast.unit.test.ts` checks every pairing in both themes.

The page script reads and writes the `verdicts` collection through the `db` capability, and asks the `user` capability whether the viewer can write. The page is published with `capabilities: {db: {}, user: {}}`, under the default `db` rules.

### Verdict documents

One document per slug, with the slug as its id:

| Field       | Type            | Meaning                                    |
| ----------- | --------------- | ------------------------------------------ |
| `rejected`  | boolean         | The prototype is rejected.                 |
| `rank`      | integer or null | 1 to the number of prototypes; not unique. |
| `winner`    | boolean         | The prototype is the winner.               |
| `updatedAt` | ISO-8601 string | When the viewer last changed this verdict. |

Rejecting a prototype clears its rank and its winner flag; ranking it or marking it the winner clears its rejection. Marking a winner writes the new winner's document first, then clears the previous winner's, so for a moment two documents can both have `winner` set to `true`; the page and the skill both take the later `updatedAt`. The page ignores a document whose id is not a slug on the page.

Each card's title leads with the version's id, `{number}.{version}` (`3.2 Catalog first`), the card's `data-id` contains it, and the summary line names the winner the same way. Cards sort winner first, then by rank, then by registration time, with rejected cards last. Controls are hidden when `can("data.write")` is `false` and when `db` is unavailable, and disabled after a refused write. Each card takes focus with Tab. On a focused card, the left and right arrow keys move to the previous and next card and the up and down arrow keys move by one row; elsewhere the arrow keys keep their usual behavior. Within a card, `x` toggles the rejection, `w` toggles the winner, and `1` to `9` set the rank.
