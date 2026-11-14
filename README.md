# Token Radar — comps-2

The best token launch radar: a program (`main.ts`, Node 22, standard library only) that
reads the sealed DefiLlama snapshot, ranks every pre-token protocol by an implied value
calibrated on the snapshot's own token protocols, and writes a dashboard a reader can use.

## The model (comps-2)

Implied value follows only from the snapshot's own figures:

```
implied = round(TVL x multiple(category) x size x growth x maturity x chains)
```

- **multiple(category)**: the median mcap/TVL of the protocols whose token already trades,
  per category, shrunk toward the global median (weight n / (n + 10)), clamped to 0.02x–0.90x.
  A category with no comps uses the global median. A DEX token trades near 0.34x its TVL, a
  lender's near 0.13x, a liquid-staking token near 0.03x — a flat multiple overvalues lenders
  threefold and undervalues exchanges.
- **size**: (TVL / median TVL of the comps) ^ -0.25, clamped to 0.40–2.50. The comps' own
  log-log fit is log(mcap) = a + 0.52 x log(TVL), so the multiple falls with size at TVL^-0.48;
  the model uses half that slope, so no single fit drives the ranking.
- **growth**: 1 + clamp(change_7d, -60, 120) / 100 x 0.5.
- **maturity**: 0.55 + min(age_days, 1460) / 1460 x 0.45; an unlisted age uses the median
  listed age.
- **chains**: 1 + 0.02 for each extra chain, at most 1.06.

No protocol name is special-cased. The calibration is recomputed from the snapshot on every
run, and the dashboard shows the calibration table and recomputes every row, so the page's
code and the board's data are visibly the same arithmetic.

## The board

198 rows: all 40 watchlist protocols, plus 122 early pre-token protocols below the floor
by TVL, plus 36 more by implied value among the rest — so a small fast grower the TVL sort
would bury is still found — plus the rankable protocols above the floor the watchlist
leaves out. A protocol counts as rankable only when it records no token and is not a
wrapped, staked or bridged product of a token that already trades (the watchlist's own
rule, applied to the whole board: no WBTC, no staked ETH, no canonical bridge of an asset
that already trades). Live-token protocols are set aside with their market caps shown,
never mixed into the ranking. Each row carries a six-step farm plan derived from the
protocol's own record (category, chains, TVL, age): gas follows the chain, capital follows
the TVL, the hold follows the age.

## The dashboard

A static page, no network: sortable and filterable board, a top-five spotlight, a detail
view for every protocol (model breakdown, why it ranks where it does, farm plan), the
calibration table, and a live-token view. Three screenshots: the board, a detail view, and
a filtered view — each rendered from this dashboard's own files.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Writes `out/board.json`, `out/data.js`, `out/dashboard/` (index.html, app.css, app.js,
comps.js), `out/screenshots/` and `out/dossier.json`. Two runs write the same bytes.

## Files

- `main.ts` — entrypoint: read snapshot, build board, write outputs and dossier
- `lib/model.ts` — the comps-2 model, the farm plans, the snapshot parser, the gate check
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte the scorer's copy
- `dashboard/` — index.html, app.css, app.js (the page; comps.js is generated at run time)
- `screenshots/` — the board, a detail view, a filtered view, rendered from this dashboard
