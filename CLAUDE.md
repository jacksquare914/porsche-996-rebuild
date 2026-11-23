# 996 Rebuild — working notes for Claude

This repo is the tracker for a full engine-out rebuild of **Jack's 2003 Porsche 996 Targa,
M96.03 3.6L**. It is two things at once:

1. **A web app** (`src/`) — a mobile-first tracker for the rebuild procedure, the parts
   list, a photo log, and a factory-style workshop manual (the Manual tab). Static
   React/Vite, no server.
2. **An agent workspace** (`.claude/`, `scripts/`) — subagents that hunt parts prices and
   write build content, both reading and writing the same live data.

## Where the data lives

There is no database. The single source of truth is a JSON file in Jack's Google Drive:

```
My Drive/Porsche 996 Rebuild/
  rebuild-state.json    <- steps, parts, quotes, log, content drafts
  photos/               <- every photo uploaded from the phone
```

The browser writes it with the `drive.file` OAuth scope. Agents read and write the same
file through the **Google Drive connector**. That is why the price agent's findings show
up in the app instantly — they are the same bytes.

Static seed data that does *not* change — the 67-step procedure and the 102-part catalog —
lives in `src/data/steps.json` and `src/data/parts.json` and ships with the app.
`rebuild-state.json` only stores *Jack's* state keyed by those ids.

## Reading and writing the live state

**Always** use the helper rather than hand-editing JSON, so concurrent edits from the phone
don't get clobbered:

```bash
node scripts/state.mjs pull  ./state.json          # after downloading from Drive
node scripts/state.mjs merge ./state.json ./patch.json ./out.json
```

`merge` is additive and id-aware: quotes and content drafts are appended (deduped by id),
`steps`/`parts` maps are shallow-merged per key, and `updated_at` is bumped. It never
deletes. See `docs/AGENTS.md` for the full loop.

## The factory parts catalogue

Jack has the official Porsche catalogue (Kat 021, English edition, 996 MY98–05, dated
24.07.2017; the USA edition Kat 521 is the same catalogue with US-only variants). It is
gitignored under `reference/` because it is copyrighted and this repo is public — it lives
in the Drive folder. Query it rather than reading the PDF:

```bash
node scripts/catalog.mjs pn 996-107-026-51      # exact part number
node scripts/catalog.mjs find "oil separator"   # by description
node scripts/catalog.mjs check                  # audit src/data/parts.json
```

**The catalogue is a 2017 snapshot and roughly two thirds of the seed list's numbers are not
in it.** It settles what a part *is* and whether it fits a 2003; **Gaudin Porsche settles
what number to order today.** Check both. Full detail, including how to read the model-year
limit column, is in `docs/CATALOG.md` — read that before touching part numbers.

## The technical database (the workshop manual's data)

Torque values, sequences, limits, tools, figures and their sources live in `public/techdb/`
as JSON and are fetched by the app at runtime. Nothing technical is hard-coded in `src/`.
`docs/TECHDB.md` has the schema and the rules; the short version:

- every value carries `sources` (document id + page); `node scripts/techdb.mjs validate`
  fails on a row without one;
- a row with `conflict` text blocks approval of any step that uses it;
- `m03` = confirmed for M96.0X by the Knowledge Gruppe torque book, `m01_only` = from the
  3.4 l WSM edition only, `open` = no source yet, `std_table` = no Porsche value, use the
  book's standard table in `public/techdb/torque-standard.json` by grade and finish;
- fastener ids follow the parts catalogue illustration and position (`kat-101-05-6`), and
  the torque book uses the same numbers;
- the drawings are Porsche's: `public/techdb/figures/` is gitignored and synced from
  `reference/figures/` with `node scripts/techdb.mjs figures`.

## House rules

- **Never invent a part number or a price.** If a vendor page doesn't show it, record
  `price_usd: null` and say so in the quote's `note`. A wrong part number on an M96 costs
  Jack a teardown, not a return shipping label.
- **Check the model-year limit.** Jack's car is a 2003 Targa, M96.03, VIN 993S6
  30061>35000. The catalogue's remark column bounds ranges: `-04` = up to end of MY2003,
  `02-` = from MY2002 on. Several parts on this engine changed mid-production.
- **Bore scoring and IMS are the two decisions that reshape the whole build.** Until the
  inspection phase is done, treat cylinder/piston and IMS choices as open.
- Prices are USD. Always capture shipping separately — several of these vendors have
  freight that swamps a $40 price difference.
- Jack's vendor accounts: FCP Euro, SSF Imported Auto Parts, Worldpac, Rusnak Porsche,
  RockAuto, LN Engineering. Worldpac and SSF are trade accounts — prices there are only
  visible when logged in, which is why the price agent drives his own Chrome.
- Don't place orders. Ever. The agent's job ends at a comparison table and a
  recommendation; Jack clicks buy.

## Build and deploy

```bash
npm run dev                       # http://localhost:5173
npm run build                     # typecheck + bundle to dist/
BASE_PATH=/ npm run build         # for hosting at a domain root instead of GitHub Pages
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
