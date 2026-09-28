# fg-site

Public site for [Frontier Games](https://frontiergames.org): standings, event results and
methodology. Served by GitHub Pages from `main` (repository root, no build step). The engine that
produces the results lives in the private `fg-bench` repo.

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Layout

| Path | What |
|---|---|
| `index.html` | Home: current leader, standings per board (tabs), event list |
| `event.html?id=<event>` | Full results for one event: every board, evidence breakdown, artifact hashes |
| `method.html` | Scoring and publication rules |
| `assets/` | `site.css`, `site.js` (renders everything from `data/`) |
| `data/index.json` | List of published events |
| `data/events/<id>.json` | One results bundle per event |
| `CNAME` | `frontiergames.org` |

## Data contract (`fg-site/0`, provisional)

The site renders bundles as given and never computes rankings, medals or intervals itself. This
is a stand-in until fg-bench publishes the JSON Schema for its results bundle (roadmap M10-04,
decision D-011); then this format is replaced by that schema.

`data/index.json`:

```json
{ "schema": "fg-site/0", "updated": "2026-09-28",
  "events": [ { "id": "pilot-001-chess", "path": "events/pilot-001-chess.json" } ] }
```

`data/events/<id>.json`:

| Field | Meaning |
|---|---|
| `id`, `title`, `track`, `date`, `summary`, `rules_version`, `manifest_digest` | Event facts |
| `status` | `final`, `provisional` or `sample` |
| `sample` | `true` shows the "sample data" banner. Real bundles omit it |
| `boards[]` | One standings table per medal: `id`, `title`, `metric`, `columns`, `standings` |
| `boards[].metric` | `label`, `method` (shown under the table), `decimals` |
| `boards[].columns[]` | Extra stat columns: `key` into `stats`, `label`, optional `format` (`percent`, `bool`) and `decimals` |
| `boards[].standings[]` | Ordered rows: `rank` (repeat a rank for a shared placement), optional `medal` (`gold`/`silver`/`bronze`), `model` {`name`, `family`, `config`}, `score`, `ci` [low, high], `stats` |
| `evidence` | Counts of `verified`, `reviewed`, `unresolved` outcomes |
| `artifacts[]` | Released files: `name`, `sha256`, optional `url` |

Only finalized, published data goes here: never private tasks, sealed reference solutions,
judge-only evidence or keys.

The two bundles in `data/events/sample-*` use fictional models and exist only to preview the
design. Delete them (and their entries in `data/index.json`) when the first real event is
published.
