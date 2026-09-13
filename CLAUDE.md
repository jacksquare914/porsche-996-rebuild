# 996 Rebuild — working notes for Claude

This repo is the tracker for a full engine-out rebuild of **Jack's 2003 Porsche 996 Targa,
M96.03 3.6L**. It is two things at once:

1. **A web app** (`src/`) — a mobile-first tracker for the rebuild procedure, the parts
   list, and a photo log. Static React/Vite, no server.
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

## House rules

- **Never invent a part number or a price.** If a vendor page doesn't show it, record
  `price_usd: null` and say so in the quote's `note`. A wrong part number on an M96 costs
  Jack a teardown, not a return shipping label.
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
