#!/usr/bin/env node
/**
 * Parse the Porsche factory parts catalogue (Kat 521, USA edition, 996 MY98-05)
 * into a lookup index.
 *
 *   pdftotext -layout kat521-usa-996-05-katalog.pdf catalog.txt
 *   node scripts/parse-catalog.mjs catalog.txt reference/catalog-index.json
 *
 * The catalogue is Porsche's copyrighted work. The PDF and this index stay OUT of
 * the public repo (see .gitignore) — they live in the Drive folder so the agents
 * can reach them. See docs/CATALOG.md.
 *
 * Row layout in the text dump (column offsets are read from each page's header,
 * because they shift by a few characters between pages):
 *
 *   Pos       Part Number      Description          Remark   Qty   Model
 *     29      900 378 242 09   Hexagon-head bolt                8
 *                              M 6 X 12                                  <- continuation
 *    (12)     996 105 901 01   Intermediate shaft   01       1
 *
 * Pos in parentheses = "part only similar as illustrated"; "-" = not illustrated.
 * Remark carries the model-year limit, per the catalogue legend: a LEADING dash
 * bounds the top of the range ("-04" = valid up to the end of MY2003) and a
 * TRAILING dash opens it ("02-" = from MY2002 onward). That column is why a 2003
 * car cannot take every number listed under an illustration.
 *
 * Continuation lines carry the catalogue's own cross-references, which are the
 * most useful thing in here:
 *   "Use also: 99610101600"  -> an alternate/replacement number
 *   "WW"                     -> this part supersedes the one above it
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: parse-catalog.mjs <catalog.txt> <out.json>');
  process.exit(1);
}

const PN_RE = /(\d{3} \d{3} \d{3} \d{2})/;
const ILL_RE = /Illustration:\s*(\d{3}-\d{2})/;
const HEADER_RE = /^(Pos\s+)Part Number\s+Description\s+Remark\s+Qty\s+Model/;
const FOOTER_RE = /^\d{2}\.\d{2}\.\d{4}/;
const SKIP_RE = /^(Model:|V-Pages|Kat \d+)/;
/** The legend page documents the format with a dummy number. */
const DUMMY = '000 000 000 00';
/** A bare 11-digit run inside a note, e.g. "Use also: 99610101600". */
const FLAT_PN_RE = /\b(\d{11})\b/g;

const fmt = (flat) =>
  `${flat.slice(0, 3)} ${flat.slice(3, 6)} ${flat.slice(6, 9)} ${flat.slice(9)}`;

const lines = readFileSync(inPath, 'utf8').split('\n');

let cols = { remark: 63, qty: 72, model: 78 };
let ill = null;
let page = 0;
let last = null;
const rows = [];

for (const raw of lines) {
  const line = raw.replace(/\s+$/, '');
  if (!line.trim()) continue;

  const h = line.match(HEADER_RE);
  if (h) {
    cols = {
      remark: line.indexOf('Remark'),
      qty: line.indexOf('Qty'),
      model: line.indexOf('Model'),
    };
    last = null;
    continue;
  }

  const illM = line.match(ILL_RE);
  if (illM) {
    ill = illM[1];
    last = null;
    continue;
  }

  if (FOOTER_RE.test(line)) {
    const p = line.match(/\s-\s*(\d+)\s/);
    if (p) page = Number(p[1]);
    last = null;
    continue;
  }
  if (SKIP_RE.test(line)) continue;

  const pnM = line.match(PN_RE);
  const pnAt = pnM ? line.indexOf(pnM[1]) : -1;

  // A real row has the part number in the Part Number column (~10-27), not in prose.
  if (pnM && pnAt >= 4 && pnAt < cols.remark - 10 && pnM[1] !== DUMMY) {
    const posRaw = line.slice(0, pnAt).trim();
    const body = line.slice(pnAt + pnM[1].length);
    const bodyStart = pnAt + pnM[1].length;

    const slice = (from, to) => {
      const s = Math.max(0, from - bodyStart);
      const e = to === undefined ? undefined : Math.max(0, to - bodyStart);
      return body.slice(s, e).trim();
    };

    last = {
      pn: pnM[1],
      desc: slice(bodyStart, cols.remark) || body.trim(),
      pos: posRaw && posRaw !== '-' ? posRaw.replace(/[()]/g, '') : null,
      similar: posRaw.startsWith('('),
      remark: slice(cols.remark, cols.qty) || null,
      qty: slice(cols.qty, cols.model) || null,
      model: slice(cols.model) || null,
      ill,
      page,
      notes: [],
      see_also: [],
      supersedes_previous: false,
    };
    rows.push(last);
    continue;
  }

  if (!last) continue;

  const t = line.trim();
  if (!t || /^Model life/.test(t)) continue;

  if (/^WW\b/.test(t)) {
    last.supersedes_previous = true;
    continue;
  }
  for (const m of t.matchAll(FLAT_PN_RE)) {
    const ref = fmt(m[1]);
    if (ref !== last.pn && !last.see_also.includes(ref)) last.see_also.push(ref);
  }
  if (!last.notes.includes(t)) last.notes.push(t);
}

// A part number appears under many illustrations; collapse to one entry each.
const byPn = new Map();
for (const r of rows) {
  let cur = byPn.get(r.pn);
  if (!cur) {
    cur = {
      pn: r.pn,
      desc: r.desc,
      notes: [],
      see_also: [],
      superseding: false,
      occurrences: [],
    };
    byPn.set(r.pn, cur);
  }
  if (r.desc && r.desc.length > cur.desc.length) cur.desc = r.desc;
  for (const n of r.notes) if (!cur.notes.includes(n)) cur.notes.push(n);
  for (const s of r.see_also) if (!cur.see_also.includes(s)) cur.see_also.push(s);
  if (r.supersedes_previous) cur.superseding = true;
  cur.occurrences.push({
    ill: r.ill,
    page: r.page,
    pos: r.pos,
    qty: r.qty,
    remark: r.remark,
    model: r.model,
  });
}

const parts = [...byPn.values()].sort((a, b) => a.pn.localeCompare(b.pn));

const index = {
  source:
    'Porsche parts catalogue Kat 521, USA/Canada edition, type 996 MY1998-2005, dated 24.07.2017',
  caution: [
    'This is a 2017 snapshot. Porsche supersedes part numbers continuously, so a number here',
    'may no longer be orderable — confirm the current number against a live dealer catalogue',
    '(Gaudin, Suncoast, Rusnak) before ordering anything.',
    'The "remark" field carries the model-year limit: a leading dash bounds the top of the range',
    '("-04" = up to the end of MY2003), a trailing dash opens it ("02-" = from MY2002 onward).',
    'A 2003 Targa (M96.03, VIN 993S6 30061>35000) cannot take every number listed under an illustration.',
    '"see_also" holds the catalogue\'s own cross-references; "superseding: true" means the catalogue',
    'marked this part as usable in place of the one preceding it.',
  ].join(' '),
  parsed_at: new Date().toISOString(),
  count: parts.length,
  parts,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(index, null, 1));

console.log(`rows parsed:    ${rows.length}`);
console.log(`unique PNs:     ${parts.length}`);
console.log(`illustrations:  ${new Set(rows.map((r) => r.ill)).size}`);
console.log(`with see_also:  ${parts.filter((p) => p.see_also.length).length}`);
console.log(`superseding:    ${parts.filter((p) => p.superseding).length}`);
console.log(`wrote ${outPath}`);
