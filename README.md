# fg-site

Public site for [Frontier Games](https://frontiergames.org): standings, event results and
methodology. Served by GitHub Pages from `main` (repository root, no build step). The engine that
produces the results lives in the private `fg-bench` repo.

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Model colours follow the model, not its rank: slots are assigned by sorted model name across all
published events, so a model has the same colour on every chart.

## Layout

| Path | What |
|---|---|
| `index.html` | Rankings: event leaders, one section per board (interval chart / table toggle, ranked list), cross-board scatter, evidence, event list |
| `event.html?id=<event>` | The same sections for one event, plus released artifact hashes |
| `arena.html?cohort=<id>` | Open-Weight Market Arena: equity curves vs baselines and random-ranking band, standings (prospective only), metrics, cohort rules; historical replay in its own tab |
| `knowledge.html` | Knowledge Horizon: per-checkpoint recall heatmaps with exposure labels. A diagnostic, never ranked |
| `models.html` | Model registry and lineage (parents, quantized/fine-tuned children, licenses, cutoffs) |
| `method.html` | Scoring, arena, knowledge-profile and publication rules |
| `assets/` | `site.css`, `site.js` (contests), `finance.js` (arena, knowledge, lineage) |
| `data/index.json` | List of published events |
| `data/events/<id>.json` | One results bundle per contest event |
| `data/models.json` | Finance model registry |
| `data/arena/<id>.json` | One bundle per arena cohort or replay |
| `data/knowledge/<id>.json` | One Knowledge Horizon profile bundle |
| `CNAME` | `frontiergames.org` |

## Data contract (`fg-site/0`, provisional)

The site renders bundles as given and never computes rankings, medals or intervals itself. This
is a stand-in until fg-bench publishes the JSON Schema for its results bundle (roadmap M10-04,
decision D-011); then this format is replaced by that schema.

`data/index.json`:

```json
{ "schema": "fg-site/0", "updated": "2026-09-28",
  "events": [ { "id": "pilot-001-challenge", "path": "events/pilot-001-challenge.json" } ],
  "models": "models.json",
  "arena": [ { "id": "arena-se-2027q1", "path": "arena/arena-se-2027q1.json" } ],
  "knowledge": [ { "id": "kh-finance-001", "path": "knowledge/kh-finance-001.json" } ] }
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
| `boards[].standings[]` | Ordered rows: `rank` (repeat a rank for a shared placement), optional `medal` (`gold`/`silver`/`bronze`), `model` {`name`, `family`, `config`, optional `short` avatar label}, `score`, `ci` [low, high], `stats` |
| (event with ≥ 2 boards) | The first two boards are also plotted against each other as a scatter |
| `evidence` | Counts of `verified`, `reviewed`, `unresolved` outcomes |
| `artifacts[]` | Released files: `name`, `sha256`, optional `url` |

### Finance bundles

These follow fg-bench decisions D-013 to D-020.

`data/models.json` has `models[]`, each an exact checkpoint: `id`, `name`, `short` (avatar label), `family`,
`checkpoint_type` (`pretrained_base` / `instruction_tuned` / `reasoning_tuned`), `financial_adaptation`, `division`
(`as_shipped` / `financially_adapted`), `params_total`, `params_active`, `quantization`, `license`, `access`,
`revision`, `weights_sha256`, `declared_cutoff` + `cutoff_source` (`null` = not declared), `available_at`,
`parents[]` {`id`, `relation`: fine-tune / adapter / merge / quantized}, `in_arena`, `in_knowledge`, optional `note`.

`data/arena/<id>.json`: `evidence_class` (`prospective_paper_trading` or `historical_replay`; they never share a
file or capital account), `status` (`exhibition`, `exploratory`, …), `market`, `currency`, `division`, `start`, `end`,
`initial_equity`, `rules` {universe, positions, fill, costs, knockout}, `commitments` {published, late}, `dates[]`,
`baselines[]` {`id`, `label`, `equity[]`}, `random_band` {`label`, `p5[]`, `p50[]`, `p95[]`} and `models[]` with
`model` (registry id), `status`, `rank` (prospective only), `equity[]` (indexed to 100) and `metrics`
{net_return, vs_buy_and_hold, max_drawdown, volatility, exposure, turnover, costs, violations, format_failures,
gpu_hours, sessions, within_random_band}. No holdings, trades or decisions ever appear (D-020).

`data/knowledge/<id>.json`: `protocol_id`, `status`, `periods[]`, `strata[]`, `fact_types[]`, `elicitations[]`,
`models[]` and `cells[]` {model, region, stratum, period, fact_type, elicitation, facts, responses, recall,
ci, baseline, label, after_availability, `detection_upper_bound` (required when label is
`NO_EXPOSURE_DETECTED`)}. Labels: `DETECTED_EXPOSURE`, `NO_EXPOSURE_DETECTED`, `INSUFFICIENT_COVERAGE`,
`UNRESOLVED`. There is no rank, no "safe" label and no safe-before date.

Only finalized, published data goes here: never private tasks, sealed reference solutions,
judge-only evidence or keys.

The `sample-*` bundles in `data/events/`, `data/arena/` and `data/knowledge/`, and `data/models.json`, use fictional models and exist only to preview the
design. Delete them (and their entries in `data/index.json`) when the first real event is
published.
