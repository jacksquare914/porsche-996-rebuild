#!/usr/bin/env node
/**
 * Safe read/merge helper for rebuild-state.json.
 *
 * The state file is edited from two places at once — Jack's phone (through the web app)
 * and agents (through the Google Drive connector). Blind overwrites lose whichever side
 * wrote last. This merges instead.
 *
 *   node scripts/state.mjs summary <state.json>
 *   node scripts/state.mjs merge   <state.json> <patch.json> [out.json]
 *   node scripts/state.mjs queue   <state.json>          # parts marked "researching"
 *   node scripts/state.mjs session <state.json> [days]   # log entries + photos, recent first
 *
 * A patch is a partial RebuildState. Merge semantics:
 *   quotes[]  / content[] / log[]  -> appended, deduped by id (patch wins on id collision)
 *   steps{}   / parts{}            -> shallow-merged per key
 *   car{}                          -> shallow-merged
 *   anything else                  -> replaced
 * Nothing is ever deleted.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [, , cmd, ...args] = process.argv;

function load(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    die(`Could not read ${p}: ${e.message}`);
  }
}

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function mergeById(base = [], patch = [], label) {
  const out = [...base];
  const byId = new Map(out.map((x, i) => [x.id, i]));
  let added = 0;
  let replaced = 0;
  for (const item of patch) {
    if (!item.id) die(`${label} entry is missing an id: ${JSON.stringify(item).slice(0, 120)}`);
    if (byId.has(item.id)) {
      out[byId.get(item.id)] = { ...out[byId.get(item.id)], ...item };
      replaced++;
    } else {
      byId.set(item.id, out.length);
      out.push(item);
      added++;
    }
  }
  return { out, added, replaced };
}

function merge(base, patch) {
  const next = { ...base };
  const report = [];

  for (const key of ['quotes', 'content', 'log']) {
    if (!patch[key]) continue;
    if (!Array.isArray(patch[key])) die(`patch.${key} must be an array`);
    const r = mergeById(base[key] ?? [], patch[key], key);
    next[key] = r.out;
    report.push(`${key}: +${r.added} new, ${r.replaced} updated`);
  }

  for (const key of ['steps', 'parts']) {
    if (!patch[key]) continue;
    next[key] = { ...(base[key] ?? {}) };
    let n = 0;
    for (const [id, val] of Object.entries(patch[key])) {
      next[key][id] = { ...(next[key][id] ?? {}), ...val };
      n++;
    }
    report.push(`${key}: ${n} keys merged`);
  }

  if (patch.car) next.car = { ...(base.car ?? {}), ...patch.car };
  for (const [k, v] of Object.entries(patch)) {
    if (['quotes', 'content', 'log', 'steps', 'parts', 'car', 'updated_at'].includes(k)) continue;
    next[k] = v;
    report.push(`${k}: replaced`);
  }

  next.updated_at = new Date().toISOString();
  return { next, report };
}

function validate(s) {
  const problems = [];
  for (const q of s.quotes ?? []) {
    if (!q.part_id) problems.push(`quote ${q.id} has no part_id`);
    if (!q.vendor) problems.push(`quote ${q.id} has no vendor`);
    if (q.price_usd !== null && typeof q.price_usd !== 'number') {
      problems.push(`quote ${q.id} price_usd must be a number or null (got ${typeof q.price_usd})`);
    }
    if (!q.checked_at) problems.push(`quote ${q.id} has no checked_at`);
  }
  for (const c of s.content ?? []) {
    if (!['ig-post', 'reel', 'build-log'].includes(c.kind)) {
      problems.push(`content ${c.id} has unknown kind "${c.kind}"`);
    }
  }
  return problems;
}

switch (cmd) {
  case 'summary': {
    const s = load(args[0]);
    const steps = Object.values(s.steps ?? {});
    const parts = Object.values(s.parts ?? {});
    const count = (arr, k, v) => arr.filter((x) => x[k] === v).length;
    console.log(`car        ${s.car?.year} ${s.car?.model} — ${s.car?.engine}`);
    console.log(`updated    ${s.updated_at}`);
    console.log(`steps      ${count(steps, 'status', 'done')} done · ${count(steps, 'status', 'active')} active · ${count(steps, 'status', 'blocked')} blocked`);
    console.log(`parts      ${count(parts, 'status', 'ordered')} ordered · ${count(parts, 'status', 'received')} received · ${count(parts, 'status', 'installed')} installed · ${count(parts, 'status', 'researching')} researching`);
    console.log(`quotes     ${(s.quotes ?? []).length}`);
    console.log(`log        ${(s.log ?? []).length} entries · ${(s.log ?? []).reduce((n, l) => n + (l.photos?.length ?? 0), 0)} photos`);
    console.log(`content    ${(s.content ?? []).length} drafts`);
    const problems = validate(s);
    if (problems.length) console.log(`\nissues:\n  ${problems.join('\n  ')}`);
    break;
  }

  case 'merge': {
    const [basePath, patchPath, outPath] = args;
    if (!basePath || !patchPath) die('usage: state.mjs merge <state.json> <patch.json> [out.json]');
    const base = load(basePath);
    const patch = load(patchPath);
    const { next, report } = merge(base, patch);
    const problems = validate(next);
    if (problems.length) die(`patch would produce invalid state:\n  ${problems.join('\n  ')}`);
    const dest = outPath ?? basePath;
    writeFileSync(dest, JSON.stringify(next, null, 1));
    console.log(report.join('\n'));
    console.log(`wrote ${dest}`);
    break;
  }

  case 'queue': {
    const s = load(args[0]);
    const ids = Object.entries(s.parts ?? {})
      .filter(([, v]) => v.status === 'researching' || v.status === 'needed')
      .map(([id, v]) => `${v.status === 'researching' ? '→' : ' '} ${id}`);
    console.log(ids.length ? ids.join('\n') : '(nothing queued — mark parts "researching" in the app)');
    break;
  }

  case 'session': {
    const s = load(args[0]);
    const days = Number(args[1] ?? 7);
    const since = Date.now() - days * 864e5;
    const recent = (s.log ?? [])
      .filter((l) => new Date(l.at).getTime() >= since)
      .sort((a, b) => b.at.localeCompare(a.at));
    if (!recent.length) {
      console.log(`(no log entries in the last ${days} days)`);
      break;
    }
    for (const l of recent) {
      console.log(`\n── ${new Date(l.at).toLocaleString()} ${l.hours ? `(${l.hours}h)` : ''}`);
      console.log(`   ${l.title || '(untitled)'}${l.step_id ? `   [step: ${l.step_id}]` : ''}`);
      if (l.body) console.log(`   ${l.body.replace(/\n/g, '\n   ')}`);
      for (const p of l.photos ?? []) {
        console.log(`   photo ${p.hero ? '★' : ' '} ${p.fileId}  ${p.caption ?? p.name ?? ''}`);
      }
    }
    break;
  }

  default:
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].split('/**')[1]
      .replace(/^\s*\* ?/gm, ''));
    process.exit(cmd ? 1 : 0);
}
