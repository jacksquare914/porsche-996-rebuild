import { useMemo, useState } from 'react';
import type { Part, PartStatus, PartCategory } from '../types';
import { CATEGORY_LABEL, PART_STATUSES } from '../types';
import {
  PARTS, PART_INDEX, STEP_INDEX, PART_STEPS, DEFAULT_PART,
  useStore, partLine, budget, fmtUsd, fmtDate,
} from '../store';
import { Sheet, Stat, Empty, Icon } from '../ui';

type Filter = 'all' | 'shortlist' | PartStatus | PartCategory;

export default function Parts({
  openId, setOpenId,
}: { openId: string | null; setOpenId: (id: string | null) => void }) {
  const { state } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const b = budget(state.parts);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return PARTS.filter((p) => {
      const st = (state.parts[p.id] ?? DEFAULT_PART).status;
      if (filter === 'shortlist' && !(p.critical && st !== 'installed' && st !== 'not-needed')) return false;
      if (filter !== 'all' && filter !== 'shortlist') {
        if (PART_STATUSES.includes(filter as PartStatus)) {
          if (st !== filter) return false;
        } else if (p.category !== filter) return false;
      }
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        p.oem_part_numbers?.some((n) => n.toLowerCase().includes(needle)) ||
        p.alt_brands?.some((a) => `${a.brand} ${a.part}`.toLowerCase().includes(needle)) ||
        p.id.includes(needle)
      );
    }).sort((a, c) => Number(Boolean(c.critical)) - Number(Boolean(a.critical)) || a.name.localeCompare(c.name));
  }, [filter, q, state.parts]);

  const cats = [...new Set(PARTS.map((p) => p.category))];

  return (
    <>
      <div className="card pad" style={{ marginBottom: 14 }}>
        <div className="statrow">
          <Stat n={fmtUsd(b.estimated)} l="est. total" />
          <Stat n={fmtUsd(b.committed)} l="spent / on order" />
          <Stat n={PARTS.filter((p) => (state.parts[p.id] ?? DEFAULT_PART).status === 'installed').length} l="installed" />
          <Stat n={b.unpriced} l="unpriced" />
        </div>
      </div>

      <input type="search" placeholder="Search parts, part numbers, brands…" value={q}
        onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />

      <div className="filters">
        {([['all', 'All'], ['shortlist', '★ Critical'],
           ['needed', 'Needed'], ['researching', 'Researching'], ['ordered', 'Ordered'],
           ['received', 'Received'], ['installed', 'Installed']] as [Filter, string][])
          .map(([k, label]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
          ))}
        {cats.map((c) => (
          <button key={c} aria-pressed={filter === c} onClick={() => setFilter(c)}>
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="card">
        {list.length === 0 && <Empty>No parts match.</Empty>}
        {list.map((p) => {
          const line = partLine(p, state.parts);
          return (
            <div className="part" key={p.id} onClick={() => setOpenId(p.id)}>
              <div className="nm">
                <b>{p.critical ? '★ ' : ''}{p.name}</b>
                <div className="pn">
                  {line.qty > 1 ? `×${line.qty} · ` : ''}
                  {p.oem_part_numbers?.[0] ?? p.alt_brands?.[0]?.part ?? CATEGORY_LABEL[p.category]}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="price">{fmtUsd(line.total)}</div>
                <span className={`chip ${line.state.status}`} style={{ marginTop: 4 }}>
                  {line.state.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {openId && PART_INDEX[openId] && (
        <PartDetail part={PART_INDEX[openId]} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}

function PartDetail({ part, onClose }: { part: Part; onClose: () => void }) {
  const { state, update } = useStore();
  const line = partLine(part, state.parts);
  const quotes = state.quotes
    .filter((qq) => qq.part_id === part.id)
    .sort((a, c) => (a.price_usd ?? 1e9) - (c.price_usd ?? 1e9));
  const best = quotes.find((qq) => qq.price_usd !== null);

  function set(patch: Partial<typeof line.state>) {
    update((d) => { d.parts[part.id] = { ...(d.parts[part.id] ?? DEFAULT_PART), ...patch }; });
  }

  return (
    <Sheet title={part.name} onClose={onClose}
      sub={`${CATEGORY_LABEL[part.category]} · qty ${part.qty}${part.replace_rule ? ` · ${part.replace_rule}` : ''}`}>
      <div className="filters" style={{ marginBottom: 0 }}>
        {PART_STATUSES.map((s) => (
          <button key={s} aria-pressed={line.state.status === s}
            onClick={() => set({
              status: s,
              ordered_at: s === 'ordered' ? new Date().toISOString() : line.state.ordered_at,
              received_at: s === 'received' ? new Date().toISOString() : line.state.received_at,
            })}>
            {s}
          </button>
        ))}
      </div>

      {part.notes && <div className="notes">{part.notes}</div>}

      <table className="spec">
        <tbody>
          {part.oem_part_numbers?.length ? (
            <tr><td>Porsche OEM</td><td>{part.oem_part_numbers.join(', ')}</td></tr>
          ) : null}
          {part.alt_brands?.map((a, i) => (
            <tr key={i}><td>{a.brand}</td><td>{a.part}</td></tr>
          ))}
          <tr><td>Baseline est.</td><td>{fmtUsd(part.est_price_usd ?? null)}</td></tr>
          {best && <tr><td>Best quote</td><td>{fmtUsd(best.price_usd)} · {best.vendor}</td></tr>}
          <tr><td>Line total</td><td>{fmtUsd(line.total)}</td></tr>
        </tbody>
      </table>

      <div className="grid2">
        <label className="field">
          <span>Qty</span>
          <input type="number" min={0} value={line.qty}
            onChange={(e) => set({ qty_override: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Unit price paid</span>
          <input type="number" step="0.01" value={line.state.unit_price ?? ''}
            placeholder={part.est_price_usd?.toString() ?? ''}
            onChange={(e) => set({ unit_price: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Vendor</span>
          <input type="text" value={line.state.vendor ?? ''} placeholder="FCP Euro"
            onChange={(e) => set({ vendor: e.target.value })} />
        </label>
        <label className="field">
          <span>Order #</span>
          <input type="text" value={line.state.order_no ?? ''}
            onChange={(e) => set({ order_no: e.target.value })} />
        </label>
      </div>

      <label className="field">
        <span>Notes</span>
        <textarea value={line.state.note ?? ''} placeholder="Backordered until…, core charge…, measured clearance…"
          onChange={(e) => set({ note: e.target.value })} />
      </label>

      <div>
        <h2 className="section">Vendor quotes</h2>
        {quotes.length === 0 ? (
          <Empty>
            No quotes yet. Ask Claude: <span className="mono">“price the {part.name}”</span> and the
            price agent will check your vendors and write the results here.
          </Empty>
        ) : (
          <div className="card">
            {quotes.map((qq) => (
              <div className="quote" key={qq.id}>
                <div className="v">
                  {qq.vendor}
                  {qq === best && <span className="chip best" style={{ marginLeft: 7 }}>best</span>}
                  {qq.in_stock === false && <span className="chip" style={{ marginLeft: 7 }}>backorder</span>}
                </div>
                <div className="p">{fmtUsd(qq.price_usd)}</div>
                <div className="m">
                  {[qq.brand, qq.sku, fmtDate(qq.checked_at)].filter(Boolean).join(' · ')}
                  {qq.url && (
                    <> · <a href={qq.url} target="_blank" rel="noreferrer">
                      open <span style={{ width: 10, height: 10, display: 'inline-block', verticalAlign: -1 }}><Icon name="ext" /></span>
                    </a></>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {PART_STEPS[part.id]?.length ? (
        <div>
          <h2 className="section">Used in</h2>
          <div className="row wrap">
            {PART_STEPS[part.id].map((sid) => (
              <span className="chip" key={sid}>{STEP_INDEX[sid]?.title ?? sid}</span>
            ))}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
