#!/usr/bin/env node
/**
 * The technical database lives in public/techdb/ as plain JSON, served with the app and
 * readable from anywhere (raw GitHub URL, a clone, another tool). This script keeps it
 * consistent. Nothing in the app hard-codes a torque value, a sequence or a source.
 *
 *   node scripts/techdb.mjs init       # draft procedures for every leaf step that has none
 *   node scripts/techdb.mjs validate   # schema, references, provenance
 *   node scripts/techdb.mjs index      # rebuild public/techdb/index.json
 *   node scripts/techdb.mjs figures    # copy reference/figures -> public/techdb/figures
 *   node scripts/techdb.mjs summary    # what is authored, what is draft, what is open
 *
 * Layout:
 *   public/techdb/documents.json        every source document and what it covers
 *   public/techdb/fasteners.json        one row per fastener: catalogue position, thread,
 *                                       qty, part numbers, torque stages, sources
 *   public/techdb/figures.json          figure registry + interactive bolt maps
 *   public/techdb/procedures/<id>.json  one file per step (id = steps.json leaf id)
 *   public/techdb/figures/*.jpg         Porsche drawings, gitignored (copyright); kept in
 *                                       reference/figures and in the Drive folder
 *
 * Provenance rule: every torque stage and every measurement limit carries `sources`, a list
 * of document ids with a page. A row with no source is a validation error. A row whose
 * sources disagree carries `conflict` text, and the app blocks approval on it.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const DB = 'public/techdb';
const [, , cmd] = process.argv;
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const save = (p, o) => writeFileSync(p, JSON.stringify(o, null, 1) + '\n');
const die = (m) => { console.error('error: ' + m); process.exit(1); };

function leaves() {
  const steps = load('src/data/steps.json');
  const out = [];
  const walk = (n, parent) => { if (n.children?.length) n.children.forEach((c) => walk(c, n)); else out.push({ ...n, parent }); };
  steps.forEach((s) => walk(s, null));
  return out;
}
function procedures() {
  const dir = join(DB, 'procedures');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => load(join(dir, f)));
}

switch (cmd) {
  case 'init': {
    mkdirSync(join(DB, 'procedures'), { recursive: true });
    let n = 0;
    for (const s of leaves()) {
      const p = join(DB, 'procedures', s.id + '.json');
      if (existsSync(p)) continue;
      const fasteners = (s.torque ?? []).map((t, i) => ({
        id: `${s.id}.t${i + 1}`,
        name: t.fastener,
        stages: [{ label: t.spec }],
        note: t.note ?? '',
        sources: t.source ? [{ doc: 'as-noted', ref: t.source }] : [],
        open: !t.source,
      }));
      save(p, {
        schema: 'techdb/1',
        id: s.id,
        status: 'draft',
        title: s.title,
        phase: s.phase,
        rg: null,
        op: null,
        time_h: s.est_hours,
        notices: s.notes ? [{ kind: 'note', text: s.notes, sources: [{ doc: 'research', ref: 'steps.json' }] }] : [],
        steps: [{ no: 1, text: s.title + '.', refs: [] }],
        fasteners,
        tools: (s.tools ?? []).map((t) => ({ name: t, special: null })),
        specs: [],
        parts: s.part_ids ?? [],
        figures: [],
        sources: [{ doc: 'research', ref: 'steps.json' }],
      });
      n++;
    }
    console.log(`drafted ${n} procedure file(s)`);
    break;
  }

  case 'figures': {
    mkdirSync(join(DB, 'figures'), { recursive: true });
    let n = 0;
    if (existsSync('reference/figures')) {
      for (const f of readdirSync('reference/figures')) { copyFileSync(join('reference/figures', f), join(DB, 'figures', f)); n++; }
    }
    console.log(`synced ${n} figure file(s) into ${DB}/figures (gitignored)`);
    break;
  }

  case 'index': {
    const docs = load(join(DB, 'documents.json'));
    const figs = load(join(DB, 'figures.json'));
    const fas = load(join(DB, 'fasteners.json'));
    const procs = procedures();
    const order = leaves().map((l) => l.id);
    procs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    save(join(DB, 'index.json'), {
      schema: 'techdb/1',
      generated_at: new Date().toISOString(),
      car: { year: 2003, model: '996 Targa', engine: 'M96.03 3.6 l', vin_range: '993S6 30061>35000' },
      documents: docs.documents.map((d) => ({ id: d.id, title: d.title, kind: d.kind, in_hand: d.in_hand })),
      counts: { procedures: procs.length, authored: procs.filter((p) => p.status === 'authored').length, fasteners: fas.fasteners.length, figures: figs.figures.length },
      procedures: procs.map((p) => ({ id: p.id, title: p.title, phase: p.phase, rg: p.rg, op: p.op, status: p.status, time_h: p.time_h, wsm_page: p.wsm_page ?? null })),
    });
    console.log(`index: ${procs.length} procedures (${procs.filter((p) => p.status === 'authored').length} authored)`);
    break;
  }

  case 'validate': {
    const problems = [];
    const docs = load(join(DB, 'documents.json'));
    const docIds = new Set(docs.documents.map((d) => d.id).concat(['research', 'as-noted']));
    const figs = load(join(DB, 'figures.json'));
    const figIds = new Set(figs.figures.map((f) => f.id));
    const fas = load(join(DB, 'fasteners.json'));
    const fasIds = new Set(fas.fasteners.map((f) => f.id));
    const parts = new Set(load('src/data/parts.json').map((p) => p.id));
    const leafIds = new Set(leaves().map((l) => l.id));
    const checkSources = (where, srcs, open) => {
      if (open) return;
      if (!srcs || !srcs.length) problems.push(`${where}: no source`);
      for (const s of srcs ?? []) if (!docIds.has(s.doc)) problems.push(`${where}: unknown document "${s.doc}"`);
    };
    for (const f of fas.fasteners) {
      if (!f.id || !f.name) problems.push(`fasteners: row without id or name`);
      checkSources(`fastener ${f.id}`, f.sources, f.open);
      if (!f.stages?.length) problems.push(`fastener ${f.id}: no torque stages`);
    }
    for (const f of figs.figures) {
      if (!existsSync(join(DB, 'figures', f.file)) && !existsSync(join('reference/figures', f.file))) problems.push(`figure ${f.id}: file ${f.file} not present locally (warning)`);
      if (f.map) {
        if (f.map.bolts.length !== f.map.order.length) problems.push(`figure ${f.id}: map has ${f.map.bolts.length} bolts but ${f.map.order.length} order entries`);
        if (new Set(f.map.order).size !== f.map.order.length) problems.push(`figure ${f.id}: duplicate order numbers`);
      }
      checkSources(`figure ${f.id}`, f.sources);
    }
    for (const p of procedures()) {
      const w = `procedure ${p.id}`;
      if (p.schema !== 'techdb/1') problems.push(`${w}: schema`);
      if (!leafIds.has(p.id)) problems.push(`${w}: id is not a leaf step in steps.json`);
      for (const pid of p.parts ?? []) if (!parts.has(pid)) problems.push(`${w}: unknown part ${pid}`);
      for (const fid of p.figures ?? []) if (!figIds.has(fid)) problems.push(`${w}: unknown figure ${fid}`);
      for (const f of p.fasteners ?? []) {
        if (f.ref && !fasIds.has(f.ref)) problems.push(`${w}: fastener ref ${f.ref} not in fasteners.json`);
        if (!f.ref) checkSources(`${w} fastener ${f.id}`, f.sources, f.open);
      }
      for (const s of p.specs ?? []) {
        if (typeof s.min !== 'number' || typeof s.max !== 'number') problems.push(`${w} spec ${s.id}: min/max`);
        checkSources(`${w} spec ${s.id}`, s.sources);
      }
      (p.steps ?? []).forEach((st, i) => {
        if (st.no !== i + 1) problems.push(`${w}: step numbering at ${i + 1}`);
        for (const r of st.refs ?? []) {
          if (r.fastener && !(p.fasteners ?? []).some((f) => f.id === r.fastener || f.ref === r.fastener)) problems.push(`${w} step ${st.no}: unknown fastener ref ${r.fastener}`);
          if (r.spec && !(p.specs ?? []).some((s) => s.id === r.spec)) problems.push(`${w} step ${st.no}: unknown spec ${r.spec}`);
          if (r.figure && !(p.figures ?? []).includes(r.figure)) problems.push(`${w} step ${st.no}: figure ${r.figure} not listed on the procedure`);
          if (r.part && !parts.has(r.part)) problems.push(`${w} step ${st.no}: unknown part ${r.part}`);
        }
        if (p.status === 'authored') {
          for (const sent of st.text.split(/(?<=[.!?])\s+/)) {
            const words = sent.replace(/\([^)]*\)/g, '()').split(/\s+/).filter(Boolean).length;
            if (words > 20) problems.push(`${w} step ${st.no}: sentence over 20 words (STE): "${sent.slice(0, 60)}…"`);
          }
        }
      });
    }
    const errs = problems.filter((p) => !p.includes('(warning)'));
    for (const p of problems) console.log((p.includes('(warning)') ? '  warn  ' : '  ERROR ') + p);
    console.log(`${errs.length} error(s), ${problems.length - errs.length} warning(s)`);
    if (errs.length) process.exit(1);
    break;
  }

  case 'summary': {
    const procs = procedures();
    const fas = load(join(DB, 'fasteners.json'));
    const open = fas.fasteners.filter((f) => f.open).length;
    const conf = fas.fasteners.filter((f) => f.conflict).length + procs.flatMap((p) => p.fasteners ?? []).filter((f) => f.conflict).length;
    console.log(`procedures  ${procs.length} (${procs.filter((p) => p.status === 'authored').length} authored, ${procs.filter((p) => p.status === 'draft').length} draft)`);
    console.log(`fasteners   ${fas.fasteners.length} rows · ${fas.fasteners.length - open} sourced · ${open} open · ${conf} conflict(s)`);
    for (const p of procs.filter((p) => p.status === 'authored')) console.log(`  authored  ${p.id}  (${p.op ?? '—'}, ${(p.steps ?? []).length} steps, ${(p.fasteners ?? []).length} fasteners, ${(p.specs ?? []).length} specs)`);
    break;
  }

  default:
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].split('/**')[1].replace(/^\s*\* ?/gm, ''));
    process.exit(cmd ? 1 : 0);
}
