import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ManualRecord, Step } from '../types';
import { PHASES, PHASE_LABEL } from '../types';
import { DEFAULT_STEP, PART_INDEX, STEPS, allLeaves, useStore, uid } from '../store';
import { Sheet } from '../ui';
import {
  docLabel, figureUrl, isVerified, loadProcedure, loadTechDb, resolveFastener,
} from '../techdb/load';
import type {
  Fastener, Figure, Notice, Procedure, Spec, StepRef, TechDb,
} from '../techdb/types';

/*
 * The workshop manual. One step is one page: safety text, tools, parts, the procedure with
 * its measured values and figures in the row where they are used, the fastener table, and
 * the conditions for approval. Every value on the page comes from public/techdb/; this file
 * only lays it out and records what Jack does.
 *
 * Wording follows ASD-STE100: one instruction per sentence, the command first, then the reason.
 */

const RG_TITLE: Record<string, string> = {
  10: 'Engine - Crankcase, suspension', 13: 'Engine - Crankshaft, pistons',
  15: 'Engine - Cylinder head, valve drive', 17: 'Engine - Lubrication', 19: 'Engine - Cooling',
  0: 'Entire vehicle - General',
};
const NOTICE_LABEL: Record<Notice['kind'], string> = {
  danger: 'DANGER', warning: 'WARNING', caution: 'CAUTION', note: 'NOTE', source: 'SOURCE', conflict: 'CAUTION · CONFLICT',
};
const STATUS_LABEL: Record<string, string> = {
  'not-needed': 'not necessary', needed: 'necessary, not ordered', researching: 'being priced',
  ordered: 'ordered', received: 'received', installed: 'installed',
};
const GLOVE_KEY = 'p996_manual_glove';
const LAST_KEY = 'p996_manual_last';

type Condition = { k: 'ok' | 'bad' | 'warn'; t: string };

export default function Manual({ stepId, onOpenPart }: { stepId: string | null; onOpenPart: (id: string) => void }) {
  const { state, update } = useStore();
  const leaves = useMemo(() => allLeaves(), []);
  const order = useMemo(() => leaves.map((l) => l.id), [leaves]);
  const [db, setDb] = useState<TechDb | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [cur, setCur] = useState<string>(() => {
    if (stepId && order.includes(stepId)) return stepId;
    try { const last = localStorage.getItem(LAST_KEY); if (last && order.includes(last)) return last; } catch { /* no storage */ }
    const first = leaves.find((l) => (state.steps[l.id] ?? DEFAULT_STEP).status !== 'done');
    return first?.id ?? order[0];
  });
  const [proc, setProc] = useState<Procedure | null | undefined>(undefined);
  const [glove, setGlove] = useState<boolean>(() => { try { return localStorage.getItem(GLOVE_KEY) === '1'; } catch { return false; } });
  const [docsOpen, setDocsOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);

  useEffect(() => { loadTechDb().then(setDb).catch((e) => setDbError(e instanceof Error ? e.message : String(e))); }, []);
  useEffect(() => { if (stepId && order.includes(stepId)) setCur(stepId); }, [stepId, order]);
  useEffect(() => {
    setProc(undefined);
    let live = true;
    loadProcedure(cur).then((p) => { if (live) setProc(p); });
    try { localStorage.setItem(LAST_KEY, cur); } catch { /* no storage */ }
    return () => { live = false; };
  }, [cur]);
  useEffect(() => { try { localStorage.setItem(GLOVE_KEY, glove ? '1' : '0'); } catch { /* no storage */ } }, [glove]);

  const go = useCallback((id: string) => { setCur(id); setTocOpen(false); location.hash = `manual:${id}`; window.scrollTo({ top: 0 }); }, []);

  const stepStatus = useCallback((id: string): 'done' | 'locked' | 'current' => {
    if ((state.steps[id] ?? DEFAULT_STEP).status === 'done') return 'done';
    const i = order.indexOf(id);
    for (let k = 0; k < i; k++) if ((state.steps[order[k]] ?? DEFAULT_STEP).status !== 'done') return 'locked';
    return 'current';
  }, [order, state.steps]);

  const meta = leaves.find((l) => l.id === cur)!;
  const rec: ManualRecord = state.steps[cur]?.manual ?? {};
  const setRec = useCallback((fn: (m: ManualRecord) => void) => {
    update((d) => {
      const st = d.steps[cur] ?? { ...DEFAULT_STEP };
      const m = structuredClone(st.manual ?? {});
      fn(m);
      d.steps[cur] = { ...st, manual: m };
    });
  }, [cur, update]);

  const n = order.indexOf(cur) + 1;
  const prevId = order[n - 2];
  const nextId = order[n];
  const status = stepStatus(cur);

  return (
    <div className={`manual${glove ? ' glove' : ''}`}>
      <div className="m-top">
        <button className="m-tb" onClick={() => setTocOpen(true)}>Contents</button>
        <div className="m-top-title"><b>Technical Manual</b><span>Engine M96/03 · 2003 Targa</span></div>
        <button className="m-tb" aria-pressed={glove} onClick={() => setGlove((g) => !g)} title="Large controls for gloves">Large controls</button>
        <button className="m-tb" onClick={() => setDocsOpen(true)}>Documents</button>
      </div>

      {dbError && <div className="m-notice caution"><span className="ico">▲</span><div><span className="lbl">CAUTION</span>The technical database did not load: {dbError}. The page shows the step title only.</div></div>}

      {db && proc === undefined && <div className="m-sheet"><p className="m-small">Loading the procedure…</p></div>}
      {db && proc !== undefined && (
        <Sheetpage db={db} proc={proc} meta={meta} n={n} total={order.length} status={status}
          prevTitle={prevId ? leaves[n - 2].title : null} nextTitle={nextId ? leaves[n].title : null}
          lockedBy={status === 'locked' ? leaves[n - 2].title : null}
          onPrev={prevId ? () => go(prevId) : undefined} onNext={nextId ? () => go(nextId) : undefined}
          rec={rec} setRec={setRec} onOpenPart={onOpenPart}
          onApprove={(record) => {
            update((d) => {
              const st = d.steps[cur] ?? { ...DEFAULT_STEP };
              const now = new Date().toISOString();
              d.steps[cur] = { ...st, status: 'done', done_at: now, manual: { ...(st.manual ?? {}), approved_at: now, approved_by: 'Jack', record } };
              d.log.push({ id: uid('log'), step_id: cur, at: now, title: `Approved: ${proc?.title ?? meta.title}`,
                body: 'Approved in the workshop manual. The measured values and the torque record are attached to the step.', photos: [] });
            });
          }} />
      )}

      {tocOpen && (
        <Sheet title="Table of contents" onClose={() => setTocOpen(false)}>
          <Toc leaves={leaves} cur={cur} stepStatus={stepStatus} onGo={go} index={db?.index.procedures ?? []} />
        </Sheet>
      )}
      {docsOpen && db && (
        <Sheet title="Documents" onClose={() => setDocsOpen(false)}>
          <Documents db={db} />
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ table of contents */

function Toc({ leaves, cur, stepStatus, onGo, index }: {
  leaves: Step[]; cur: string; stepStatus: (id: string) => 'done' | 'locked' | 'current'; onGo: (id: string) => void;
  index: TechDb['index']['procedures'];
}) {
  const byId = Object.fromEntries(index.map((p) => [p.id, p]));
  return (
    <div className="m-toc">
      {PHASES.map((ph) => {
        const roots = STEPS.filter((s) => s.phase === ph);
        if (!roots.length) return null;
        return (
          <div key={ph}>
            <h4>{PHASE_LABEL[ph]}</h4>
            {roots.map((r) => (
              <div key={r.id} className="m-toc-proc">
                <div className="m-toc-ptitle">{r.title}</div>
                {(r.children?.length ? r.children : [r]).map((s) => {
                  const st = stepStatus(s.id);
                  const ix = byId[s.id];
                  return (
                    <button key={s.id} className="m-toc-step" aria-current={s.id === cur} onClick={() => onGo(s.id)}>
                      <span className={`m-st ${st}`} />
                      <span style={{ flex: 1 }}>{s.title}</span>
                      <span className="m-toc-op">{ix?.op ?? String(leaves.findIndex((l) => l.id === s.id) + 1).padStart(2, '0')}{ix?.status === 'draft' ? ' · draft' : ''}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ documents */

function Documents({ db }: { db: TechDb }) {
  const docs = Object.values(db.documents);
  const fas = Object.values(db.fasteners);
  return (
    <div className="m-docs">
      <div className="m-notice note"><span className="ico">i</span><div><span className="lbl">NOTE</span>Each torque value, limit, sequence and special tool in the manual has its document and page. ✓ = the value is on a page of a document in hand. ! = the value has no factory page. Conflict = two documents do not agree. A conflict blocks approval.</div></div>
      {docs.map((d) => (
        <div key={d.id} className="m-doc">
          <b>{d.title}</b>
          <span className={`m-tag ${d.in_hand ? 'ok' : 'warn'}`}>{d.in_hand ? 'in hand' : 'not in hand'}</span>
          <span className="m-doc-d">{d.coverage}{d.caveat ? ` ${d.caveat}` : ''}{d.where ? ` Where: ${d.where}` : ''}</span>
        </div>
      ))}
      <p className="m-small">Fastener rows: {fas.length}. Confirmed for M96.0X by the torque book: {fas.filter((f) => f.m03).length}. From the M96/01 edition only: {fas.filter((f) => f.m01_only).length}. Open conflicts: {fas.filter((f) => f.conflict).length}.</p>
      {db.standard && <StandardTable std={db.standard} db={db} />}
    </div>
  );
}

/** The torque book's table for fasteners with no Porsche value, by size, grade and finish. */
function StandardTable({ std, db }: { std: TechDb['standard'] & object; db: TechDb }) {
  const sizes = Array.from(new Set(std.rows.map((r) => r.size)));
  const grades = Array.from(new Set(std.rows.map((r) => r.grade)));
  const cell = (size: string, grade: string, finish: 'ZN' | 'ZNS') => std.rows.find((r) => r.size === size && r.grade === grade && r.finish === finish)?.nm;
  return (
    <div className="m-std">
      <h3 className="m-sec">{std.title}</h3>
      <div className="m-notice caution"><span className="ico">▲</span><div><span className="lbl">CAUTION</span>{std.use}</div></div>
      <div className="m-scroll"><table className="m-table m-std-table">
        <thead>
          <tr><th rowSpan={2}>Size</th>{grades.map((g) => <th key={g} colSpan={2}>Grade {g}</th>)}</tr>
          <tr>{grades.map((g) => [<th key={g + 'zn'}>yellow ZN</th>, <th key={g + 'zns'}>silver ZNS</th>])}</tr>
        </thead>
        <tbody>
          {sizes.map((size) => (
            <tr key={size}>
              <td><b>{size}</b></td>
              {grades.map((g) => [<td key={g + 'zn'}>{cell(size, g, 'ZN') ?? '—'}</td>, <td key={g + 'zns'}>{cell(size, g, 'ZNS') ?? '—'}</td>])}
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="m-small">Values in {std.unit}. {std.sources.map((s) => docLabel(db, s)).join('; ')}.</p>
      <ul className="m-small m-std-rules">{std.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
    </div>
  );
}

/* ------------------------------------------------------------------ the sheet */

function specResult(sp: Spec, v: string | undefined): 'pass' | 'fail' | null {
  if (v === undefined || v.trim() === '' || Number.isNaN(Number(v))) return null;
  const x = Number(v);
  return x >= sp.min && x <= sp.max ? 'pass' : 'fail';
}
function resText(sp: Spec, v: string, r: 'pass' | 'fail'): string {
  if (r === 'pass') return 'The value is in the limits.';
  const x = Number(v);
  return `The value is out of the limits: ${x < sp.min ? (sp.min - x).toFixed(2) + ' ' + sp.unit + ' below the minimum' : (x - sp.max).toFixed(2) + ' ' + sp.unit + ' above the maximum'}. Measure again.`;
}

function Sheetpage(props: {
  db: TechDb; proc: Procedure | null; meta: Step; n: number; total: number; status: 'done' | 'locked' | 'current';
  prevTitle: string | null; nextTitle: string | null; lockedBy: string | null;
  onPrev?: () => void; onNext?: () => void; rec: ManualRecord; setRec: (fn: (m: ManualRecord) => void) => void;
  onOpenPart: (id: string) => void; onApprove: (record: Record<string, unknown>) => void;
}) {
  const { db, proc, meta, n, total, status, rec, setRec } = props;
  const { state } = useStore();
  const rg = proc?.rg ?? 0;
  const fasteners: Fastener[] = useMemo(() => (proc?.fasteners ?? []).map((f) => resolveFastener(db, f)), [db, proc]);
  const figures: Figure[] = useMemo(() => (proc?.figures ?? []).map((id) => db.figures[id]).filter(Boolean), [db, proc]);
  const seqFigures = figures.filter((f) => f.map);
  const checklist = rec.checklist ?? {};
  const measurements = rec.measurements ?? {};
  const toolsOn = rec.tools ?? {};
  const seq = rec.sequence ?? {};
  const approved = Boolean(rec.approved_at) || status === 'done';

  /* conditions for approval */
  const conditions: Condition[] = [];
  if (!proc) conditions.push({ k: 'warn', t: 'This step has no procedure file yet. The Build tab still records it.' });
  else {
    if (props.lockedBy) conditions.push({ k: 'bad', t: `The step before this step is not approved: ${props.lockedBy}. Mark earlier steps done on the Build tab.` });
    const left = proc.steps.filter((s) => !checklist[String(s.no)]).length;
    conditions.push(left ? { k: 'bad', t: `Steps not finished: ${left} of ${proc.steps.length}` } : { k: 'ok', t: 'All steps are finished' });
    if (proc.specs.length) {
      let empty = 0, fail = 0;
      for (const sp of proc.specs) { const r = specResult(sp, measurements[sp.id]); if (r === null) empty++; else if (r === 'fail') fail++; }
      if (fail) conditions.push({ k: 'bad', t: `Measured values out of the limits: ${fail}` });
      if (empty) conditions.push({ k: 'bad', t: `Measured values not recorded: ${empty}` });
      if (!fail && !empty) conditions.push({ k: 'ok', t: 'All measured values are in the limits' });
    }
    for (const f of seqFigures) {
      const m = f.map!; const q = seq[f.id] ?? { stage: 0, i: 0 }; const tot = m.stages.length * m.order.length; const done = q.stage * m.order.length + q.i;
      conditions.push(done >= tot ? { k: 'ok', t: `Torque sequence ${f.id} recorded for all stages` } : { k: 'bad', t: `Torque sequence ${f.id} not complete: ${done} of ${tot} bolt-stages recorded` });
    }
    for (const f of fasteners) if (f.conflict) conditions.push({ k: 'bad', t: `Conflict, ${f.name}: ${f.conflict}` });
    const unver = fasteners.filter((f) => !isVerified(db, f)).length + proc.specs.filter((s) => !isVerified(db, s)).length;
    if (unver) conditions.push({ k: 'warn', t: `Rows without a factory page: ${unver}. The approval record shows this.` });
    const m01 = fasteners.filter((f) => f.m01_only).length;
    if (m01) conditions.push({ k: 'warn', t: `Rows from the M96/01 edition only: ${m01}. Confirmation for the M96/03 is necessary.` });
    const m03 = fasteners.filter((f) => f.m03).length;
    if (m03) conditions.push({ k: 'ok', t: `Rows confirmed for M96.0X by the torque book: ${m03}` });
  }
  const canApprove = Boolean(proc) && !conditions.some((c) => c.k === 'bad');

  function approve() {
    if (!proc) return;
    const record = {
      procedure: proc.id, op: proc.op, wsm_page: proc.wsm_page,
      steps: proc.steps.map((s) => ({ no: s.no, done: true })),
      measurements: proc.specs.map((sp) => ({ spec: sp.id, value: Number(measurements[sp.id]), unit: sp.unit, min: sp.min, max: sp.max, result: specResult(sp, measurements[sp.id]), sources: sp.sources })),
      torque_record: seqFigures.map((f) => ({ figure: f.id, stages: f.map!.stages, sequence: f.map!.order, done: true })),
      fasteners: fasteners.map((f) => ({ id: f.id, name: f.name, stages: f.stages.map((s) => s.label), sources: f.sources, m03: Boolean(f.m03), m01_only: Boolean(f.m01_only) })),
      tools_on_bench: proc.tools.filter((_, i) => toolsOn[String(i)]).map((t) => t.name),
      rows_without_factory_page: fasteners.filter((f) => !isVerified(db, f)).map((f) => f.id),
      conditions: conditions.map((c) => `${c.k}: ${c.t}`),
    };
    props.onApprove(record);
  }

  const notices = proc?.notices ?? (meta.notes ? [{ kind: 'note' as const, text: meta.notes }] : []);
  const ICO: Record<string, string> = { danger: '▲', warning: '▲', caution: '▲', conflict: '▲', note: 'i', source: '§' };

  return (
    <div className="m-sheet">
      <div className="m-runhead"><span className="car">911 Carrera (996)</span><span className="grp">{proc?.rg_title ?? RG_TITLE[rg] ?? PHASE_LABEL[meta.phase]}</span><span className="rgnum">{rg || '–'}</span></div>
      <h1>{proc?.title ?? meta.title}</h1>
      <div className="m-meta">
        <span><b>{proc?.op ?? '—'}</b> {proc?.op_title ?? meta.title}</span>
        <span>Time: <b>{proc?.time_h ?? meta.est_hours} h</b></span>
        <span>Step {n} of {total}</span>
        {approved ? <span className="m-state done">Approved{rec.approved_at ? ` · ${new Date(rec.approved_at).toLocaleDateString()}` : ''}</span>
          : status === 'locked' ? <span className="m-state lock">The step before this step is not approved. Work is recorded; approval waits.</span>
          : <span className="m-state">Current step</span>}
        {proc?.status === 'draft' && <span className="m-tag warn">draft procedure</span>}
      </div>
      <div className="m-progress"><i style={{ width: `${proc ? Math.round(100 * proc.steps.filter((s) => checklist[String(s.no)]).length / proc.steps.length) : 0}%` }} /></div>

      {notices.map((nt, i) => (
        <div key={i} className={`m-notice ${nt.kind === 'conflict' ? 'caution' : nt.kind}`}>
          <span className="ico">{ICO[nt.kind]}</span>
          <div><span className="lbl">{NOTICE_LABEL[nt.kind]}</span>{nt.text}
            {'sources' in nt && nt.sources?.length ? <div className="m-src v">{nt.sources.map((s) => docLabel(db, s)).join(' · ')}</div> : null}</div>
        </div>
      ))}

      {proc && proc.tools.length > 0 && (
        <>
          <h3 className="m-sec" id="m-sec-tools">Tools</h3>
          <table className="m-table">
            <thead><tr><th>On bench</th><th>Designation</th><th>Special tool</th><th>Explanation</th></tr></thead>
            <tbody>
              {proc.tools.map((t, i) => (
                <tr key={i} className={toolsOn[String(i)] ? 'have' : ''}>
                  <td><button className="m-chk" aria-pressed={Boolean(toolsOn[String(i)])} title="Touch when the tool is on the bench." onClick={() => setRec((m) => { m.tools = { ...(m.tools ?? {}), [String(i)]: !toolsOn[String(i)] }; })}>{toolsOn[String(i)] ? '✓' : ''}</button></td>
                  <td>{t.name}</td><td>{t.special ?? '—'}</td><td className="m-small">{t.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {proc && proc.parts.length > 0 && (
        <>
          <h3 className="m-sec" id="m-sec-parts">Parts</h3>
          <div className="m-scroll"><table className="m-table">
            <thead><tr><th>Designation</th><th>Part number</th><th>Status in the app</th></tr></thead>
            <tbody>
              {proc.parts.map((pid) => {
                const p = PART_INDEX[pid]; if (!p) return null;
                const ps = state.parts[pid]?.status ?? 'needed';
                return (
                  <tr key={pid} onClick={() => props.onOpenPart(pid)} style={{ cursor: 'pointer' }}>
                    <td>{p.name}</td>
                    <td>{p.oem_part_numbers?.length ? p.oem_part_numbers.map((x) => <div key={x}>{x}</div>) : <span className="m-src u">! no part number</span>}</td>
                    <td><span className={`m-tag ${ps === 'received' || ps === 'installed' ? 'ok' : ps === 'needed' ? 'bad' : ''}`}>{STATUS_LABEL[ps] ?? ps}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <p className="m-small">Parts with the status "necessary, not ordered" are not on the bench. Touch a row to open the part.</p>
        </>
      )}

      <h3 className="m-sec" id="m-sec-proc">Procedure</h3>
      {proc ? (
        <table className="m-table m-proc">
          <thead><tr><th>No.</th><th>Procedure</th></tr></thead>
          <tbody>
            {proc.steps.map((s, i) => {
              const done = Boolean(checklist[String(s.no)]);
              const blocked = i > 0 && !checklist[String(proc.steps[i - 1].no)] && !done;
              const figRefs = s.refs.filter((r) => r.figure);
              return (
                <tr key={s.no} className={`${done ? 'done' : ''} ${blocked ? 'blocked' : ''}`}>
                  <td>
                    <button className="m-chk big" aria-pressed={done} disabled={approved}
                      title={blocked ? 'Finish the step before this step first.' : 'Touch to record this step as finished.'}
                      onClick={(e) => {
                        if (blocked) { e.currentTarget.animate([{ transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }], { duration: 250 }); return; }
                        setRec((m) => { const c = { ...(m.checklist ?? {}) }; c[String(s.no)] = !done; if (done) for (const later of proc.steps.slice(i + 1)) c[String(later.no)] = false; m.checklist = c; });
                      }}>{done ? '✓' : s.no}</button>
                  </td>
                  <td>
                    <div className="m-txt">{s.text}</div>
                    <RefChips refs={s.refs} fasteners={fasteners} />
                    {s.refs.filter((r) => r.spec).map((r) => { const sp = proc.specs.find((x) => x.id === r.spec); return sp ? <Measure key={sp.id} sp={sp} db={db} value={measurements[sp.id] ?? ''} disabled={approved} onChange={(v) => setRec((m) => { m.measurements = { ...(m.measurements ?? {}), [sp.id]: v }; })} /> : null; })}
                    {s.refs.some((r) => r.timer) && proc.timer_s ? <Timer seconds={proc.timer_s} startedAt={rec.timer_started_at} onToggle={() => setRec((m) => { m.timer_started_at = m.timer_started_at ? undefined : new Date().toISOString(); })} /> : null}
                    {figRefs.map((r) => { const f = db.figures[r.figure!]; return f ? <FigureBlock key={f.id} db={db} fig={f} progress={seq[f.id] ?? { stage: 0, i: 0 }} disabled={approved} showBead={Boolean(r.bead)}
                      onProgress={(p) => setRec((m) => { m.sequence = { ...(m.sequence ?? {}), [f.id]: p }; })} /> : null; })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <p className="m-small">No procedure file for this step yet (public/techdb/procedures/{meta.id}.json).</p>}
      {proc?.spec_note && <p className="m-small">{proc.spec_note}</p>}
      {/* exploded views that no step references directly */}
      {figures.filter((f) => !f.map && !(proc?.steps ?? []).some((s) => s.refs.some((r) => r.figure === f.id))).map((f) => <FigureBlock key={f.id} db={db} fig={f} progress={{ stage: 0, i: 0 }} disabled onProgress={() => {}} showBead={false} />)}

      {fasteners.length > 0 && (
        <>
          <h3 className="m-sec" id="m-sec-fast">Fasteners</h3>
          <div className="m-scroll"><table className="m-table">
            <thead><tr><th>Pos.</th><th>Designation</th><th>Part number</th><th>Thread</th><th>Qty.</th><th>Installation</th><th>Tightening</th><th>Document</th></tr></thead>
            <tbody>
              {fasteners.map((f) => (
                <tr key={f.id}>
                  <td><b>{f.pos ?? '—'}</b>{f.ill ? <div className="m-small">{f.ill}</div> : null}</td>
                  <td>{f.name}{f.caveat ? <div className="m-small">{f.caveat}</div> : null}</td>
                  <td className="m-small">{f.pn?.length ? f.pn.map((x) => <div key={x}>{x}</div>) : '—'}</td>
                  <td>{f.thread ?? '—'}</td>
                  <td>{f.qty ?? '—'}{f.per_bank ? <div className="m-small">{f.per_bank} per bank</div> : null}</td>
                  <td>{f.reuse ?? ''}{f.lube ? <div className="m-small">{f.lube}</div> : null}</td>
                  <td>{f.stages.map((s, i) => <span key={i} className={`m-stage${s.undo ? ' undo' : ''}`}>{i + 1}. {s.label}</span>)}</td>
                  <td>
                    {f.sources.map((s, i) => <div key={i} className={`m-src ${isVerified(db, { sources: [s] }) ? 'v' : 'u'}`}>{isVerified(db, { sources: [s] }) ? '✓ ' : '! '}{docLabel(db, s)}</div>)}
                    {f.m03 ? <span className="m-tag ok">M96.0X</span> : f.m01_only ? <span className="m-tag warn">M96/01 only</span> : null}
                    {f.conflict ? <span className="m-tag bad" title={f.conflict}>conflict</span> : null}
                    {f.open ? <span className="m-tag warn">open</span> : null}
                    {f.std_table ? <span className="m-tag" title="Porsche gives no value. Read the grade and the finish on the bolt head, then take the value from the standard table in Documents.">standard table {f.std_table}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="m-small">✓ = the value is on a page of a document in hand. ! = no factory page. Conflict = two documents do not agree, and approval is blocked.</p>
        </>
      )}

      <div className="m-gate">
        <h3>Conditions for approval</h3>
        <ul>{conditions.map((c, i) => <li key={i} className={c.k}>{c.k === 'ok' ? '✓' : c.k === 'bad' ? '✕' : '!'} {c.t}</li>)}</ul>
        <div className="act">
          {approved ? <span className="m-big ok">Approved</span>
            : <button className="m-big" disabled={!canApprove} onClick={approve}>Approve the step</button>}
          <span className="m-small">{approved ? 'The record is in rebuild-state.json under this step.' : canApprove ? 'Approval writes the status, the measured values, the torque record and the document references to rebuild-state.json.' : 'The button stays locked until all conditions with ✕ are removed.'}</span>
        </div>
        {rec.record ? <details className="m-record"><summary>Approval record</summary><pre>{JSON.stringify(rec.record, null, 1)}</pre></details> : null}
      </div>

      <div className="m-navbtns">
        {props.onPrev ? <button className="m-seqbtn" onClick={props.onPrev}>◀ {props.prevTitle}</button> : <span />}
        {props.onNext ? <button className="m-seqbtn" onClick={props.onNext}>{props.nextTitle} ▶</button> : null}
      </div>
      <div className="m-runfoot">
        <span className="op"><b>{proc?.op ?? ''}</b>{proc?.op_title ?? meta.title}</span>
        <span className="pg">{proc?.wsm_page ?? `${rg || '0'} - ${n}`}</span>
        <span className="imp">{proc?.imprint ?? 'Draft from research notes, not from a factory page'} · 996 Rebuild tracker</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function RefChips({ refs, fasteners }: { refs: StepRef[]; fasteners: Fastener[] }) {
  const chips = refs.map((r, i) => {
    if (r.fastener) { const f = fasteners.find((x) => x.id === r.fastener); return <a key={i} className="m-cal" href="#m-sec-fast" onClick={(e) => { e.preventDefault(); document.getElementById('m-sec-fast')?.scrollIntoView({ behavior: 'smooth' }); }}><b>Pos. {f?.pos ?? '?'}</b> {f?.name ?? r.fastener}</a>; }
    if (r.tool) return <a key={i} className="m-cal" href="#m-sec-tools" onClick={(e) => { e.preventDefault(); document.getElementById('m-sec-tools')?.scrollIntoView({ behavior: 'smooth' }); }}>Tool: {r.tool}</a>;
    if (r.part) { const p = PART_INDEX[r.part]; return <a key={i} className="m-cal" href="#m-sec-parts" onClick={(e) => { e.preventDefault(); document.getElementById('m-sec-parts')?.scrollIntoView({ behavior: 'smooth' }); }}>Part: {p?.name ?? r.part}{p?.oem_part_numbers?.[0] ? <b> {p.oem_part_numbers[0]}</b> : null}</a>; }
    return null;
  }).filter(Boolean);
  return chips.length ? <div className="m-refs">{chips}</div> : null;
}

function Measure({ sp, db, value, disabled, onChange }: { sp: Spec; db: TechDb; value: string; disabled: boolean; onChange: (v: string) => void }) {
  const r = specResult(sp, value);
  return (
    <div className={`m-meas ${r ?? ''}`}>
      <div>
        <div><b>Measured value:</b> {sp.name}</div>
        <div className="m-rng">Limits {sp.min.toFixed(2)} to {sp.max.toFixed(2)} {sp.unit}{sp.wear_limit ? ` · wear limit ${sp.wear_limit.toFixed(2)} ${sp.unit}` : ''} · <span className={`m-src ${isVerified(db, sp) ? 'v' : 'u'}`}>{isVerified(db, sp) ? '✓' : '!'} {sp.sources.map((s) => docLabel(db, s)).join('; ')}</span></div>
      </div>
      <input inputMode="decimal" placeholder="0.00" value={value} disabled={disabled} aria-label={sp.name} onChange={(e) => onChange(e.target.value)} />
      {r ? <div className="m-res">{resText(sp, value, r)}</div> : null}
    </div>
  );
}

function Timer({ seconds, startedAt, onToggle }: { seconds: number; startedAt?: string; onToggle: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 500); return () => clearInterval(t); }, []);
  const left = startedAt ? seconds - Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000) : seconds;
  const a = Math.abs(left);
  return (
    <div className={`m-timer${startedAt && left <= 0 ? ' late' : ''}`}>
      <div className="t">{left < 0 ? '−' : ''}{Math.floor(a / 60)}:{String(a % 60).padStart(2, '0')}</div>
      <div style={{ flex: 1 }}>
        <button className="m-seqbtn primary" onClick={onToggle}>{startedAt ? 'Reset the timer' : 'Start the timer (bead started)'}</button>
        <div className="m-small" style={{ marginTop: 4 }}>The time becomes red at zero. If the time is over, do not install the bolts. Clean the surfaces and start again.</div>
      </div>
    </div>
  );
}

function FigureBlock({ db, fig, progress, disabled, showBead, onProgress }: {
  db: TechDb; fig: Figure; progress: { stage: number; i: number }; disabled: boolean; showBead: boolean;
  onProgress: (p: { stage: number; i: number }) => void;
}) {
  const [guided, setGuided] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [wrong, setWrong] = useState<number | null>(null);
  const [imgOk, setImgOk] = useState(true);
  const beadRef = useRef<SVGPathElement>(null);
  const timer = useRef<number>(0);
  const map = fig.map;
  const total = map ? map.stages.length * map.order.length : 0;
  const doneN = map ? progress.stage * map.order.length + progress.i : 0;
  const complete = map ? progress.stage >= map.stages.length : false;

  useEffect(() => () => clearInterval(timer.current), []);

  function tap(b: number) {
    if (!map || !guided || complete || disabled) return;
    const want = map.order[progress.i];
    if (b === want) {
      let { stage, i } = progress; i++; if (i >= map.order.length) { stage++; i = 0; }
      onProgress({ stage, i });
    } else { setWrong(b); setTimeout(() => setWrong(null), 600); }
  }
  function play() {
    if (!map) return; setGuided(false); clearInterval(timer.current); let k = 0; setPreview(0);
    timer.current = setInterval(() => { k++; if (k >= map.order.length) { clearInterval(timer.current); setPreview(null); return; } setPreview(k); }, 550) as unknown as number;
  }
  function playBead() {
    const p = beadRef.current; if (!p) return; const L = p.getTotalLength();
    p.style.transition = 'none'; p.style.strokeDasharray = String(L); p.style.strokeDashoffset = String(L);
    requestAnimationFrame(() => { p.style.transition = 'stroke-dashoffset 6s linear'; p.style.strokeDashoffset = '0'; });
  }
  const statusText = () => {
    if (!map) return '';
    if (wrong !== null) return `Wrong bolt. You touched bolt ${wrong}. The sequence gives bolt ${map.order[progress.i]}. Nothing is recorded.`;
    if (preview !== null) return `Preview. Stage ${Math.min(progress.stage, map.stages.length - 1) + 1}, ${map.stages[Math.min(progress.stage, map.stages.length - 1)]}. Bolt ${map.order[preview]} (${preview + 1} of ${map.order.length}).`;
    if (complete) return `All ${map.stages.length} stages are recorded. ${total} bolt-stages.`;
    return guided ? `Stage ${progress.stage + 1}, ${map.stages[progress.stage]}. Next bolt: ${map.order[progress.i]}. Done in this stage: ${progress.i} of ${map.order.length}.`
      : `Stage ${progress.stage + 1}, ${map.stages[progress.stage]}. Recorded: ${doneN} of ${total} bolt-stages. Use the guided mode to record.`;
  };

  return (
    <div className="m-dia">
      <div className="m-dh"><b>Fig. {fig.id.replace(/^(wsm|kat)-/, '')}</b> {fig.title}<span className="r">{fig.sources.map((s) => docLabel(db, s)).join('; ')}</span></div>
      {map && (
        <svg viewBox={map.viewBox.join(' ')} role="img" aria-label={fig.title}>
          <Outline kind={map.outline} beadRef={showBead ? beadRef : null} />
          {map.bolts.map(([x, y, num]) => {
            const idx = map.order.indexOf(num);
            const cls = ['m-bolt', wrong === num ? 'wrong' : complete || (preview === null && idx < progress.i) || (preview !== null && idx < preview) ? 'torqued' : '', preview === idx ? 'hl' : '', guided && !complete && map.order[progress.i] === num ? 'next' : ''].join(' ');
            return <g key={num} className={cls} onClick={() => tap(num)}><circle cx={x} cy={y} r={map.outline === 'case' ? 10 : 13} /><text x={x} y={y}>{num}</text></g>;
          })}
        </svg>
      )}
      {map && <div className="m-fignote">{map.note}</div>}
      {map && (
        <>
          <div className="m-stages">{map.stages.map((s, i) => <span key={i} className={`s ${i < progress.stage ? 'done' : i === progress.stage ? 'on' : ''}`}>{i + 1}. {s}</span>)}</div>
          <div className="m-seqbar">
            <button className="m-seqbtn primary" onClick={play}>Show the sequence</button>
            <button className={`m-seqbtn${guided ? ' primary' : ''}`} aria-pressed={guided} disabled={disabled} onClick={() => setGuided((g) => !g)}>Guided mode</button>
            <button className="m-seqbtn" disabled={disabled} onClick={() => { setGuided(false); onProgress({ stage: 0, i: 0 }); }}>Reset</button>
            {showBead && <button className="m-seqbtn" onClick={playBead}>Show the bead path</button>}
            <div className={`m-seqstat${wrong !== null ? ' bad' : ''}`}>{statusText()}</div>
          </div>
        </>
      )}
      <div className="m-dh" style={{ borderTop: '1px solid var(--m-rule2)' }}><b>{map ? 'Factory figure' : 'Parts figure'}</b>{fig.legend ? ' with catalogue positions' : ''}</div>
      {imgOk ? <img src={figureUrl(fig.file)} alt={fig.title} onError={() => setImgOk(false)} />
        : <div className="m-fignote">The figure file {fig.file} is not on this host. The drawings are Porsche's and stay out of the public repo; they are in reference/figures and in the Drive folder.</div>}
      {fig.legend && <div className="m-fignote">{fig.legend}</div>}
    </div>
  );
}

function Outline({ kind, beadRef }: { kind: 'head' | 'case' | 'bearing'; beadRef: React.RefObject<SVGPathElement | null> | null }) {
  if (kind === 'head') return (
    <>
      <rect x="30" y="28" width="380" height="168" rx="10" className="m-inkf" />
      {[0, 1, 2].map((i) => <circle key={i} cx={132 + i * 120} cy="112" r="34" className="m-ink" strokeDasharray="4 3" />)}
      <text x="30" y="214" className="m-lbl">Cylinder head screws, one bank. Numbers = tightening sequence.</text>
    </>
  );
  if (kind === 'case') {
    const d = 'M60,30 H360 Q380,30 380,50 V240 Q380,262 358,262 H300 V250 H250 V262 H110 Q82,262 82,240 V60 Q82,30 60,30 Z';
    return (
      <>
        {beadRef && <path ref={beadRef} className="m-bead" d={d} />}
        <path d={d} className="m-ink" strokeDasharray="3 3" />
        <text x="14" y="282" className="m-lbl">Crankcase bolts M6 × 35. Numbers = tightening sequence.</text>
        {beadRef && <text x="14" y="294" className="m-lbl">Red line = sealant bead on the bank 4-6 half.</text>}
      </>
    );
  }
  return (
    <>
      <rect x="24" y="36" width="420" height="128" rx="8" className="m-inkf" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => <g key={i}><rect x={62 + i * 56 - 16} y="88" width="32" height="24" rx="3" className="m-ink" strokeDasharray="3 2" /><text x={62 + i * 56} y="100" className="m-lbl" textAnchor="middle" dominantBaseline="central">M{i + 1}</text></g>)}
      <text x="24" y="188" className="m-lbl">Thrust-bearing screws M9, 14 off. M1 to M7 = main bearings.</text>
    </>
  );
}
