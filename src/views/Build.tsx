import { useState } from 'react';
import type { Step, StepStatus } from '../types';
import { PHASES, PHASE_LABEL } from '../types';
import {
  STEPS, DEFAULT_STEP, useStore, progressOf, hoursOf, PART_INDEX, allLeaves,
} from '../store';
import { Icon, Sheet, Stat } from '../ui';

const NEXT: Record<StepStatus, StepStatus> = {
  todo: 'active', active: 'done', done: 'todo', blocked: 'todo',
};

export default function Build({ onOpenPart }: { onOpenPart: (id: string) => void }) {
  const { state, update } = useStore();
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const first = STEPS.find((s) => progressOf(s, {}) < 1);
    return first ? { [first.id]: true } : {};
  });
  const [detail, setDetail] = useState<Step | null>(null);

  const ls = allLeaves();
  const doneCount = ls.filter((l) => (state.steps[l.id] ?? DEFAULT_STEP).status === 'done').length;
  const totalHours = ls.reduce((s, l) => s + (l.est_hours || 0), 0);
  const doneHours = ls.reduce(
    (s, l) => s + ((state.steps[l.id] ?? DEFAULT_STEP).status === 'done' ? l.est_hours || 0 : 0), 0);
  const active = ls.filter((l) => (state.steps[l.id] ?? DEFAULT_STEP).status === 'active');

  function cycle(id: string) {
    update((d) => {
      const cur = d.steps[id] ?? { ...DEFAULT_STEP };
      const next = NEXT[cur.status];
      d.steps[id] = {
        ...cur,
        status: next,
        started_at: next === 'active' ? (cur.started_at ?? new Date().toISOString()) : cur.started_at,
        done_at: next === 'done' ? new Date().toISOString() : undefined,
      };
    });
  }

  function setStatus(id: string, status: StepStatus) {
    update((d) => {
      d.steps[id] = { ...(d.steps[id] ?? DEFAULT_STEP), status,
        done_at: status === 'done' ? new Date().toISOString() : undefined };
    });
  }

  const byPhase = PHASES.map((p) => ({ phase: p, roots: STEPS.filter((s) => s.phase === p) }))
    .filter((g) => g.roots.length);

  return (
    <>
      <div className="card pad" style={{ marginBottom: 14 }}>
        <div className="statrow">
          <Stat n={`${Math.round((doneHours / (totalHours || 1)) * 100)}%`} l="complete" />
          <Stat n={`${doneCount}/${ls.length}`} l="steps done" />
          <Stat n={`${Math.round(doneHours)}h`} l={`of ~${Math.round(totalHours)}h`} />
          <Stat n={active.length} l="in progress" />
        </div>
        <div className="bar" style={{ marginTop: 12 }}>
          <i style={{ width: `${(doneHours / (totalHours || 1)) * 100}%` }} />
        </div>
      </div>

      {active.length > 0 && (
        <>
          <h2 className="section">On the bench now</h2>
          <div className="card">
            {active.map((s) => (
              <div key={s.id} className="step depth1 active">
                <button className="tick active" onClick={() => setStatus(s.id, 'done')}
                  aria-label={`Mark ${s.title} done`}>
                  <span style={{ width: 13, height: 13, display: 'block' }}><Icon name="check" /></span>
                </button>
                <div className="body" onClick={() => setDetail(s)}>
                  <div className="title">{s.title}</div>
                  <div className="meta">{PHASE_LABEL[s.phase]} · ~{s.est_hours}h</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="section">Procedure</h2>
      {byPhase.map(({ phase, roots }) => {
        const hrs = roots.reduce((s, r) => s + hoursOf(r), 0);
        const prog = roots.reduce((s, r) => s + progressOf(r, state.steps) * hoursOf(r), 0) / (hrs || 1);
        const expanded = roots.some((r) => open[r.id]);
        return (
          <div className="card" key={phase}>
            <button className="phase-head" aria-expanded={expanded}
              onClick={() => setOpen((o) => {
                const next = { ...o };
                for (const r of roots) next[r.id] = !expanded;
                return next;
              })}>
              <span className="tw" style={{ width: 14, height: 14, display: 'block' }}><Icon name="chev" /></span>
              <b style={{ flex: 1 }}>{PHASE_LABEL[phase]}</b>
              <span className="mono dim nowrap">{Math.round(prog * 100)}% · {hrs}h</span>
            </button>
            <div className="bar" style={{ height: 3, borderRadius: 0 }}>
              <i className={prog >= 1 ? 'ok' : ''} style={{ width: `${prog * 100}%` }} />
            </div>
            {expanded && roots.map((r) => (
              <StepRows key={r.id} step={r} depth={1} onDetail={setDetail} onCycle={cycle} />
            ))}
          </div>
        );
      })}

      {detail && (
        <StepDetail step={detail} onClose={() => setDetail(null)} onOpenPart={onOpenPart}
          onStatus={(s) => setStatus(detail.id, s)} />
      )}
    </>
  );
}

function StepRows({
  step, depth, onDetail, onCycle,
}: { step: Step; depth: number; onDetail: (s: Step) => void; onCycle: (id: string) => void }) {
  const { state } = useStore();
  const st = state.steps[step.id] ?? DEFAULT_STEP;
  const isParent = Boolean(step.children?.length);
  const prog = progressOf(step, state.steps);

  return (
    <>
      <div className={`step depth${Math.min(depth, 3)} ${st.status}${isParent ? ' parent' : ''}`}>
        {isParent ? (
          <div className={`ring${prog >= 1 ? ' full' : ''}`}
            title={`${Math.round(prog * 100)}% of this section done`}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5">
              <circle className="track" cx="12" cy="12" r="9" stroke="currentColor" opacity="0.35" />
              <circle className="fill" cx="12" cy="12" r="9" stroke="currentColor" strokeLinecap="round"
                strokeDasharray={`${prog * 2 * Math.PI * 9} ${2 * Math.PI * 9}`} />
            </svg>
          </div>
        ) : (
          <button className={`tick ${st.status}`} onClick={() => onCycle(step.id)}
            aria-label={`Cycle status of ${step.title}`}>
            <span style={{ width: 13, height: 13, display: 'block' }}><Icon name="check" /></span>
          </button>
        )}
        <div className="body" onClick={() => onDetail(step)}>
          <div className="title" style={isParent ? { fontWeight: 600 } : undefined}>{step.title}</div>
          <div className="meta">
            ~{isParent ? hoursOf(step) : step.est_hours}h
            {step.part_ids?.length ? ` · ${step.part_ids.length} part${step.part_ids.length > 1 ? 's' : ''}` : ''}
            {step.torque?.length ? ` · ${step.torque.length} torque spec${step.torque.length > 1 ? 's' : ''}` : ''}
            {step.tools?.length ? ' · special tools' : ''}
          </div>
        </div>
      </div>
      {isParent && step.children!.map((c) => (
        <StepRows key={c.id} step={c} depth={depth + 1} onDetail={onDetail} onCycle={onCycle} />
      ))}
    </>
  );
}

function StepDetail({
  step, onClose, onOpenPart, onStatus,
}: { step: Step; onClose: () => void; onOpenPart: (id: string) => void; onStatus: (s: StepStatus) => void }) {
  const { state, update } = useStore();
  const st = state.steps[step.id] ?? DEFAULT_STEP;
  const isParent = Boolean(step.children?.length);

  return (
    <Sheet title={step.title} onClose={onClose}
      sub={`${PHASE_LABEL[step.phase]} · ~${isParent ? hoursOf(step) : step.est_hours}h · ${step.id}`}>
      {!isParent && (
        <div className="row wrap">
          {(['todo', 'active', 'blocked', 'done'] as StepStatus[]).map((s) => (
            <button key={s} className={`btn sm ${st.status === s ? 'primary' : ''}`}
              onClick={() => onStatus(s)}>
              {s === 'todo' ? 'Not started' : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}

      {step.notes && <div className="notes">{step.notes}</div>}

      {step.torque?.length ? (
        <div>
          <h2 className="section">Torque</h2>
          <table className="spec">
            <tbody>
              {step.torque.map((t, i) => (
                <tr key={i}>
                  <td>{t.fastener}{t.note && <div className="dim small" style={{ marginTop: 3 }}>{t.note}</div>}</td>
                  <td>{t.spec}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {step.tools?.length ? (
        <div>
          <h2 className="section">Special tools</h2>
          <div className="row wrap">
            {step.tools.map((t) => <span className="chip" key={t}>{t}</span>)}
          </div>
        </div>
      ) : null}

      {step.part_ids?.length ? (
        <div>
          <h2 className="section">Parts for this step</h2>
          <div className="card">
            {step.part_ids.map((pid) => {
              const p = PART_INDEX[pid];
              if (!p) return null;
              const ps = state.parts[pid];
              return (
                <div className="part" key={pid} onClick={() => { onClose(); onOpenPart(pid); }}>
                  <div className="nm">
                    <b>{p.name}</b>
                    <div className="pn">{p.oem_part_numbers?.[0] ?? p.alt_brands?.[0]?.part ?? p.category}</div>
                  </div>
                  <span className={`chip ${ps?.status ?? 'needed'}`}>{ps?.status ?? 'needed'}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <label className="field">
        <span>Your notes on this step</span>
        <textarea value={st.note ?? ''} placeholder="What you found, what you'd do differently, measurements…"
          onChange={(e) => update((d) => {
            d.steps[step.id] = { ...(d.steps[step.id] ?? DEFAULT_STEP), note: e.target.value };
          })} />
      </label>

      {!isParent && (
        <label className="field">
          <span>Actual hours</span>
          <input type="number" step="0.5" value={st.actual_hours ?? ''}
            onChange={(e) => update((d) => {
              d.steps[step.id] = {
                ...(d.steps[step.id] ?? DEFAULT_STEP),
                actual_hours: e.target.value === '' ? undefined : Number(e.target.value),
              };
            })} />
        </label>
      )}
    </Sheet>
  );
}
