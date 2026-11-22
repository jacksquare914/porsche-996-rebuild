#!/usr/bin/env node
/**
 * Look things up in the factory parts catalogue index.
 *
 *   node scripts/catalog.mjs pn 996 107 026 51     # exact part number
 *   node scripts/catalog.mjs find "oil separator"  # description search
 *   node scripts/catalog.mjs ill 103-10            # everything under one illustration
 *   node scripts/catalog.mjs check                 # audit src/data/parts.json
 *
 * The index is built by scripts/parse-catalog.mjs and lives at
 * reference/catalog-index.json, which is gitignored — see docs/CATALOG.md.
 */

import { readFileSync, existsSync } from 'node:fs';

const INDEX = 'reference/catalog-index.json';

if (!existsSync(INDEX)) {
  console.error(`No catalogue index at ${INDEX}.`);
  console.error('Build it:');
  console.error('  pdftotext -layout reference/kat021-e-996-05-katalog.pdf /tmp/catalog.txt');
  console.error(`  node scripts/parse-catalog.mjs /tmp/catalog.txt ${INDEX}`);
  process.exit(1);
}

const cat = JSON.parse(readFileSync(INDEX, 'utf8'));
const flat = new Map(cat.parts.map((p) => [p.pn.replace(/\s/g, ''), p]));

const digits = (s) => s.replace(/\D/g, '');
const fmt = (f) => `${f.slice(0, 3)} ${f.slice(3, 6)} ${f.slice(6, 9)} ${f.slice(9)}`;

function show(p, indent = '') {
  console.log(`${indent}${p.pn}  ${p.desc}`);
  for (const n of p.notes.slice(0, 6)) console.log(`${indent}    ${n}`);
  const occ = p.occurrences;
  const limited = occ.filter((o) => o.remark);
  console.log(
    `${indent}    illustrations: ${[...new Set(occ.map((o) => o.ill))].join(', ')}`,
  );
  if (limited.length) {
    console.log(
      `${indent}    ⚠ model-year limit: ${[...new Set(limited.map((o) => o.remark))].join(', ')}` +
        '   ("-04" = up to end of MY2003; "02-" = from MY2002 on)',
    );
  }
  const qty = [...new Set(occ.map((o) => o.qty).filter(Boolean))];
  if (qty.length) console.log(`${indent}    qty per car: ${qty.join(' / ')}`);
  if (p.see_also.length) console.log(`${indent}    see also: ${p.see_also.join(', ')}`);
  if (p.superseding) console.log(`${indent}    ✎ catalogue marks this as replacing the preceding part`);
}

const [, , cmd, ...rest] = process.argv;
const arg = rest.join(' ').trim();

switch (cmd) {
  case 'pn': {
    const d = digits(arg);
    if (d.length !== 11) {
      console.error(`"${arg}" is not an 11-digit Porsche part number.`);
      process.exit(1);
    }
    const hit = flat.get(d);
    if (hit) {
      show(hit);
      break;
    }
    console.log(`${fmt(d)}  — NOT in this catalogue edition.`);
    console.log('');
    console.log('That usually means one of:');
    console.log('  · the number has been superseded since this 2017 edition');
    console.log('  · it is not a 996 part (wrong model, or an aftermarket number)');
    console.log('  · it is a special-tool number, which the parts catalogue does not list');
    console.log('');
    // Offer near neighbours — supersessions usually change only the last two digits.
    const stem = d.slice(0, 9);
    const near = cat.parts.filter((p) => p.pn.replace(/\s/g, '').startsWith(stem));
    if (near.length) {
      console.log('Same base number, different suffix — a likely supersession chain:');
      for (const n of near) show(n, '  ');
    }
    console.log('\nConfirm the current number against a live dealer catalogue before ordering.');
    break;
  }

  case 'find': {
    const q = arg.toLowerCase();
    if (!q) {
      console.error('usage: catalog.mjs find "<text>"');
      process.exit(1);
    }
    const hits = cat.parts.filter(
      (p) =>
        p.desc.toLowerCase().includes(q) ||
        p.notes.some((n) => n.toLowerCase().includes(q)),
    );
    console.log(`${hits.length} match${hits.length === 1 ? '' : 'es'} for "${arg}"\n`);
    for (const h of hits.slice(0, 40)) show(h);
    if (hits.length > 40) console.log(`\n… and ${hits.length - 40} more. Narrow the search.`);
    break;
  }

  case 'ill': {
    const hits = cat.parts.filter((p) => p.occurrences.some((o) => o.ill === arg));
    if (!hits.length) {
      console.error(`No illustration "${arg}". Format is like 103-10.`);
      process.exit(1);
    }
    console.log(`Illustration ${arg} — ${hits.length} parts\n`);
    for (const h of hits) {
      const o = h.occurrences.find((x) => x.ill === arg);
      console.log(
        `${(o.pos ?? '-').padStart(4)}  ${h.pn}  ${h.desc}` +
          `${o.qty ? `  ×${o.qty}` : ''}${o.remark ? `  [${o.remark}]` : ''}`,
      );
    }
    break;
  }

  case 'check': {
    const parts = JSON.parse(readFileSync('src/data/parts.json', 'utf8'));
    let ok = 0;
    const bad = [];
    for (const p of parts) {
      for (const raw of p.oem_part_numbers ?? []) {
        const d = digits(raw);
        if (d.length !== 11) continue;
        if (flat.has(d)) ok += 1;
        else bad.push({ id: p.id, name: p.name, raw, stem: d.slice(0, 9) });
      }
    }
    console.log(`Confirmed against ${cat.source}\n`);
    console.log(`  in catalogue:  ${ok}`);
    console.log(`  not found:     ${bad.length}\n`);
    if (bad.length) {
      console.log('Not in this edition — verify each against a dealer catalogue:\n');
      for (const b of bad) {
        const near = cat.parts
          .filter((p) => p.pn.replace(/\s/g, '').startsWith(b.stem))
          .map((p) => `${p.pn} (${p.desc})`);
        console.log(`  ${b.raw}  ${b.name}`);
        if (near.length) console.log(`      catalogue has: ${near.join('; ')}`);
      }
    }
    break;
  }

  default:
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].split('/**')[1]
      .replace(/^\s*\* ?/gm, ''));
    process.exit(cmd ? 1 : 0);
}
