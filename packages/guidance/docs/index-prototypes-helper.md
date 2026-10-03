# Prototype index helper

`src/index-prototypes/` contains the helper that the `index-prototypes` skill runs, bundled to `content/skills/index-prototypes/index-prototypes.mjs`. It keeps a prototype set's manifest, stores the set's screenshots, and renders the set's index page. It does not publish anything: The skill publishes the page with the Artifact tool and reads its verdicts with ArtifactData.

## Commands

Every command prints one JSON result to stdout. A result has `ok: true` and the command's fields, or `ok: false` with an `error` code and a `message`, in which case the command exits 1. A value-bearing flag accepts both `--flag value` and `--flag=value`.

```bash
index-prototypes.mjs register --set-dir <dir> --slug <slug> --title <text> --url <url> [--set-title <text>] [--source <path>] [--lens <text>] [--inputs <a,b,...>] [--description <text>] [--screenshot <png>]
index-prototypes.mjs record-index --set-dir <dir> --url <url>
index-prototypes.mjs render --set-dir <dir> --out <file>
```

- **`register`** appends an entry to the set's manifest, creating the manifest on the set's first registration, which requires `--set-title`. A later `--set-title` renames the set. The entry's `version` is 1 for a new slug and one past the slug's highest version otherwise, and `registeredAt` is the UTC time of the call. `--inputs` is split on commas, and each item is trimmed. `--source` is recorded as given, not copied. `--url` must be an http or https URL. The result contains `manifestPath` and the new `entry`.
- **`record-index`** stores the published index page's URL as the manifest's `indexUrl`, which later registrations keep. The result contains `manifestPath` and `indexUrl`.
- **`render`** writes the index page to `--out`. The result contains `path`, `bytes`, `cards`, `title`, `indexUrl`, `missingShots` (slugs whose recorded screenshot is missing from disk), and a `warning` when the page exceeds 12,000,000 bytes. Above 16,000,000 bytes, the artifact page cap, `render` writes nothing and returns `page-too-large`.

The error codes are `invalid-args`, `invalid-manifest`, `invalid-slug`, `invalid-url`, `manifest-not-found`, `missing-set-title`, `not-png`, `page-too-large`, and `screenshot-not-found`.

## Slugs

A slug matches `[a-z0-9][a-z0-9-]{0,39}`, so that it serves as a file stem and as a `db` document id unchanged.

## Manifest

`manifest.json` in the set directory, written through a sibling temporary file and a rename:

```json
{
  "title": "Header variants",
  "indexUrl": "https://claude.ai/artifact/…",
  "entries": [
    {
      "slug": "dense",
      "version": 1,
      "registeredAt": "2026-10-03T01:19:36.000Z",
      "title": "Dense header",
      "url": "https://claude.ai/artifact/…",
      "source": "/…/prototypes/dense-v1.html",
      "lens": "information density",
      "inputs": ["ticket", "sketch"],
      "description": "Packs the toolbar into one row.",
      "shot": "shots/dense-v1.png"
    }
  ]
}
```

`indexUrl`, `source`, `lens`, `description`, and `shot` are `null` when absent. Every registration stays in `entries`; the page shows the highest version of each slug, in order of the slug's first registration. A registration without `--screenshot` renders the placeholder even when an earlier version had a screenshot, since that screenshot shows the earlier version.

## Screenshots

`--screenshot` must be a PNG file. The helper stores it unchanged as `shots/{slug}-v{version}.png`, and `render` embeds each stored screenshot as a `data:image/png;base64` URI. The skill captures at 1280×800 CSS pixels, which the page shows in cards at least 480px wide.

## Index page

The page is Artifact page content: `<title>` and `<style>` first, without a document wrapper. Its colours are the tokens in `tokens.ts`, declared for the light theme, the dark scheme, and an explicit `data-theme="dark"`; `tokens-contrast.unit.test.ts` checks every pairing in both themes.

The page script reads and writes the `verdicts` collection through the `db` capability, and asks the `user` capability whether the viewer can write. The page is published with `capabilities: {db: {}, user: {}}`, under the default `db` rules.

### Verdict documents

One document per slug, with the slug as its id:

| Field       | Type            | Meaning                                    |
| ----------- | --------------- | ------------------------------------------ |
| `rejected`  | boolean         | The prototype is rejected.                 |
| `rank`      | integer or null | 1 to the number of prototypes; not unique. |
| `winner`    | boolean         | The prototype is the winner.               |
| `updatedAt` | ISO-8601 string | When the viewer last changed this verdict. |

Rejecting a prototype clears its rank and its winner flag; ranking it or marking it the winner clears its rejection. Marking a winner writes the new winner's document first, then clears the previous winner's, so for a moment two documents can claim the win; the page and the skill both take the later `updatedAt`. The page ignores a document whose id is not a slug on the page.

Cards sort winner first, then by rank, then by registration time, with rejected cards last. Controls are hidden when `can("data.write")` is `false` and when `db` is unavailable, and disabled after a refused write. Each card takes focus with Tab. On a focused card, the left and right arrow keys move to the previous and next card and the up and down arrow keys move by one row; elsewhere the arrow keys keep their usual behavior. Within a card, `x` toggles the rejection, `w` toggles the winner, and `1` to `9` set the rank.
