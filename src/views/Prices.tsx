import { useMemo, useState } from 'react';
import { PART_INDEX, DEFAULT_PART, useStore, fmtUsd, fmtDate, uid, PARTS } from '../store';
import { Sheet, Empty, Stat, Icon } from '../ui';
import type { PriceQuote } from '../types';

export const VENDORS = [
  'Gaudin Porsche',
  'FCP Euro',
  'SSF Imported Auto Parts',
  'Worldpac',
  'Rusnak Porsche',
  'RockAuto',
  'LN Engineering',
] as const;

export default function Prices({ onOpenPart }: { onOpenPart: (id: string) => void }) {
  const { state, update } = useStore();
  const [adding, setAdding] = useState(false);

  const grouped = useMemo(() => {
    const byPart: Record<string, PriceQuote[]> = {};
    for (const q of state.quotes) (byPart[q.part_id] ??= []).push(q);
    return Object.entries(byPart)
      .map(([partId, quotes]) => {
        const sorted = [...quotes].sort((a, b) => (a.price_usd ?? 1e9) - (b.price_usd ?? 1e9));
        const priced = sorted.filter((q) => q.price_usd !== null);
        const best = priced[0];
        const worst = priced[priced.length - 1];
        return {
          partId,
          quotes: sorted,
          best,
          save: best && worst && worst !== best ? (worst.price_usd! - best.price_usd!) : 0,
        };
      })
      .sort((a, b) => b.save - a.save);
  }, [state.quotes]);

  const totalSave = grouped.reduce((s, g) => s + g.save, 0);
  const researching = PARTS.filter(
    (p) => (state.parts[p.id] ?? DEFAULT_PART).status === 'researching');

  return (
    <>
      <div className="card pad" style={{ marginBottom: 14 }}>
        <div className="statrow">
          <Stat n={state.quotes.length} l="quotes" />
          <Stat n={grouped.length} l="parts priced" />
          <Stat n={fmtUsd(totalSave)} l="spread captured" />
          <Stat n={researching.length} l="queued" />
        </div>
      </div>

      <div className="banner info">
        Ask Claude <span className="mono">“run the price agent”</span> and it will open your
        logged-in Chrome, check {VENDORS.slice(0, 3).join(', ')} and the rest, and write the
        quotes straight into this page. Anything you mark <b>Researching</b> on the Parts tab
        goes into its queue.
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => setAdding(true)}>
          <span style={{ width: 12, height: 12, display: 'inline-block', verticalAlign: -1, marginRight: 5 }}>
            <Icon name="plus" />
          </span>
          Add quote by hand
        </button>
      </div>

      {grouped.length === 0 ? (
        <Empty>
          No quotes yet.<br />
          Mark the parts you want priced as <b>Researching</b>, then ask Claude to run the price agent.
        </Empty>
      ) : (
        grouped.map((g) => {
          const part = PART_INDEX[g.partId];
          return (
            <div className="card" key={g.partId}>
              <button className="phase-head" onClick={() => onOpenPart(g.partId)}>
                <b style={{ flex: 1 }}>{part?.name ?? g.partId}</b>
                {g.save > 0 && <span className="chip best">save {fmtUsd(g.save)}</span>}
              </button>
              {g.quotes.map((q) => (
                <div className="quote" key={q.id}>
                  <div className="v">
                    {q.vendor}
                    {q === g.best && <span className="chip best" style={{ marginLeft: 7 }}>best</span>}
                    {q.in_stock === false && <span className="chip" style={{ marginLeft: 7 }}>backorder</span>}
                  </div>
                  <div className="p">
                    {fmtUsd(q.price_usd)}
                    {q.shipping_usd ? (
                      <div className="dim" style={{ fontSize: 10, fontWeight: 400, marginTop: 3 }}>
                        +{fmtUsd(q.shipping_usd)} ship
                      </div>
                    ) : null}
                  </div>
                  <div className="m">
                    {[q.brand, q.sku, fmtDate(q.checked_at)].filter(Boolean).join(' · ')}
                    {q.url && (
                      <> · <a href={q.url} target="_blank" rel="noreferrer">open</a></>
                    )}
                    {q.note ? <div style={{ marginTop: 3 }}>{q.note}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          );
        })
      )}

      {adding && (
        <AddQuote onClose={() => setAdding(false)}
          onSave={(q) => { update((d) => { d.quotes.push(q); }); setAdding(false); }} />
      )}
    </>
  );
}

function AddQuote({ onClose, onSave }: { onClose: () => void; onSave: (q: PriceQuote) => void }) {
  const [q, setQ] = useState<PriceQuote>({
    id: uid('q'), part_id: '', vendor: VENDORS[0], price_usd: null,
    checked_at: new Date().toISOString(),
  });
  return (
    <Sheet title="Add a quote" onClose={onClose}>
      <label className="field">
        <span>Part</span>
        <select value={q.part_id} onChange={(e) => setQ((p) => ({ ...p, part_id: e.target.value }))}>
          <option value="">— pick a part —</option>
          {PARTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Vendor</span>
        <input type="text" list="vendors" value={q.vendor}
          onChange={(e) => setQ((p) => ({ ...p, vendor: e.target.value }))} />
        <datalist id="vendors">{VENDORS.map((v) => <option key={v} value={v} />)}</datalist>
      </label>
      <div className="grid2">
        <label className="field">
          <span>Price</span>
          <input type="number" step="0.01" value={q.price_usd ?? ''}
            onChange={(e) => setQ((p) => ({
              ...p, price_usd: e.target.value === '' ? null : Number(e.target.value),
            }))} />
        </label>
        <label className="field">
          <span>Shipping</span>
          <input type="number" step="0.01" value={q.shipping_usd ?? ''}
            onChange={(e) => setQ((p) => ({
              ...p, shipping_usd: e.target.value === '' ? undefined : Number(e.target.value),
            }))} />
        </label>
      </div>
      <label className="field">
        <span>Vendor SKU</span>
        <input type="text" value={q.sku ?? ''} onChange={(e) => setQ((p) => ({ ...p, sku: e.target.value }))} />
      </label>
      <label className="field">
        <span>Link</span>
        <input type="text" value={q.url ?? ''} onChange={(e) => setQ((p) => ({ ...p, url: e.target.value }))} />
      </label>
      <div className="row">
        <div className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!q.part_id} onClick={() => onSave(q)}>Save</button>
      </div>
    </Sheet>
  );
}
