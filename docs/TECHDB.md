# The technical database

Everything the workshop manual shows — torque values, tightening sequences, measurement
limits, special tools, figures, safety text, and where each of those came from — lives in
`public/techdb/` as plain JSON. The app **fetches** these files at runtime; it does not
bundle them. That is deliberate: the same files can be read by anything else.

```
public/techdb/
  index.json                 manifest: procedures, documents, counts (rebuilt by the script)
  documents.json             every source document, what it covers, whether it is in hand
  fasteners.json             one row per fastener: catalogue position, thread, qty,
                             part numbers, torque stages, flags, sources
  figures.json               figure registry; sequence figures carry an interactive bolt map
  procedures/<step-id>.json  one file per leaf step of src/data/steps.json
  figures/*.jpg|png          Porsche drawings — gitignored, synced from reference/figures
```

Reading it from elsewhere:

```bash
# any machine
curl -s https://raw.githubusercontent.com/jacksquare914/porsche-996-rebuild/main/public/techdb/fasteners.json | jq '.fasteners[] | select(.m03) | {id,name,stages}'

# this repo
node -e 'console.log(require("./public/techdb/fasteners.json").fasteners.length)'
```

## The rules

1. **Every value has a source.** A torque stage, a limit, a sequence, a special tool: each
   carries `sources: [{doc, ref}]` where `doc` is an id in `documents.json` and `ref` is a
   page or item. `node scripts/techdb.mjs validate` fails on a row without one.
2. **A conflict blocks approval.** When two sources disagree, the row gets `conflict` text.
   The Manual tab shows it as a hard stop; Jack cannot approve the step until the row is
   settled and the text removed.
3. **Edition flags say how far a value is trusted.** `m03: true` means the Knowledge Gruppe
   torque book confirms it for M96.0X (it lists M96.03 rows where the engines differ).
   `m01_only: true` means only the M96/01 (3.4 l) edition of the WSM covers it so far.
   `open: true` means no usable source yet: shown, never trusted.
4. **Fasteners are keyed to the parts catalogue.** Row ids are `kat-<illustration>-<position>`
   where a catalogue position exists (`kat-101-05-6` is the M6 × 35 crankcase bolt). The
   torque book uses the same position numbers, so a book row drops straight onto a catalogue
   drawing. Rows from the WSM torque tables without a catalogue anchor yet are `wsm-<slug>`.
5. **Our words, their numbers.** Procedure text is written here in ASD-STE100 (one
   instruction per sentence, command first, then the reason). Factory text is cited, not
   copied. The drawings are Porsche's and stay out of the public repo.
6. **Nothing is deleted.** A superseded value gets a note and a new source; the old one
   stays in git history.

## Adding a page from the torque book

Photograph the page flat, one page per photo. Then, per row:

```json
{ "id": "kat-103-01-25", "ill": "103-01", "pos": 25,
  "name": "Cylinder head screws", "thread": "M10 x 230", "qty": 24, "pn": ["996 104 180 58"],
  "stages": [{ "label": "30 Nm in sequence", "nm": 30 }, { "label": "Loosen all", "undo": true }, ...],
  "m03": true,
  "sources": [{ "doc": "torque-book", "ref": "p.21 item 25" }, { "doc": "wsm-g1p2", "ref": "p.15-13" }] }
```

Keep the full transcription of the page in `reference/torque-book/996-fastening-specifications.json`
(gitignored, copyrighted) and put only the rows the procedures need in `fasteners.json`.
Then:

```bash
node scripts/techdb.mjs validate
node scripts/techdb.mjs index
```

## Authoring a procedure

Start from the draft file the script generated (`status: "draft"`, one generic step, the
research notes as a NOTE). Replace it with:

- `rg`, `op`, `op_title`, `wsm_page`, `imprint` from the WSM page footer;
- `notices` in factory order: SOURCE first, then DANGER / WARNING / CAUTION, then NOTE;
- `steps`, numbered, each with `refs` to the fastener rows, tools, parts, specs and figures
  it uses (`{"figure": "wsm-652_97", "sequence": true}` puts the guided tightening map in
  that row; `{"spec": "axial-play"}` puts the measurement box there; `{"timer": true}`
  starts the sealant clock);
- `fasteners` as `{"ref": "<fasteners.json id>"}`, or inline rows for one-off items;
- `specs` with `min`, `max`, `unit`, optional `wear_limit`, and sources;
- `figures`: the WSM sequence figure and the catalogue exploded view.

Set `status: "authored"`. The validator checks references and the 20-word STE limit.

## Figures

`figures.json` names each drawing and, for a sequence figure, carries the interactive map:
bolt positions as `[x, y, sequence-number]` in the figure's `viewBox`, the tightening
`order`, and the `stages`. The app draws a schematic outline (`head`, `case`, `bearing`)
behind the bolts and shows the factory drawing underneath.

Image files come from two places: crops of WSM figure pages (`pdftoppm` then crop) and the
catalogue's embedded 375 dpi line art (`pdfimages -png` on the illustration page, lossless).
They live in `reference/figures/` and in the Drive folder; `node scripts/techdb.mjs figures`
copies them into `public/techdb/figures/` for a local build. A deploy without them shows a
note in place of each image; the maps and tables still work.

## What the app writes back

The Manual tab stores working data under the step in `rebuild-state.json`
(`steps[<id>].manual`): checklist ticks, measured values, tools on the bench, sequence
progress, the sealant timer. Approval sets `status: "done"`, stamps `approved_at`, writes a
`record` snapshot (values, results, torque record, sources, open items) and appends a log
entry. Agents read the same bytes through `scripts/state.mjs`.

## The bill of materials

`public/techdb/bom.json` is the build-specific shopping list: what LN supplies or machines
(group A), what is bought by Porsche part number at the best price (group B), what is
inspected before buying (group C), and what the 4.0 l conversion makes unnecessary
(group D). Each line carries the catalogue illustration and position, the LN SKU where one
applies, and a listed price only where a source names one. Regenerate the shareable page
with the generator in the session scratchpad or read the JSON directly.
