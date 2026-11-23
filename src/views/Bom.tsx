import { useEffect, useState } from 'react';
import { DEFAULT_PART, PART_INDEX, useStore } from '../store';
import { loadBom } from '../techdb/load';
import type { Bom, BomLine } from '../techdb/types';
import { Empty } from '../ui';

/*
 * The bill of materials, read from public/techdb/bom.json. Four groups: what LN supplies
 * or machines, what is bought by Porsche part number at the best price, what is inspected
 * first, and what the 4.0 l conversion makes unnecessary. A line that maps to a part in
 * parts.json shows that part's status and opens it on touch; group B can be queued for the
 * price agent in one touch.
 */

const GROUPS: BomLine['group'][] = ['ln', 'porsche-pn', 'inspect', 'not-needed'];

/** Part numbers worth pasting into a vendor search: the catalogue-verified ones. */
function orderable(pn: string[] | undefined): string[] {
  return pn ?? [];
}

export default function BomView({ onOpenPart }: { onOpenPart: (id: string) => void }) {
  const { state, update } = useStore();
  const [bom, setBom] = useState<Bom | null | undefined>(undefined);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { loadBom().then(setBom).catch(() => setBom(null)); }, []);

  if (bom === undefined) return <Empty>Loading the bill of materials…</Empty>;
  if (bom === null) return <Empty>The bill of materials did not load (techdb/bom.json).</Empty>;

  async function copy(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); }
    catch { window.prompt('Copy this list', text); }
  }

  function queueForPricing(lines: BomLine[]) {
    update((d) => {
      for (const l of lines) {
        if (!l.part_id || !PART_INDEX[l.part_id]) continue;
        const cur = d.parts[l.part_id] ?? { ...DEFAULT_PART };
        if (cur.status === 'needed' || cur.status === 'not-needed') d.parts[l.part_id] = { ...cur, status: 'researching' };
      }
    });
  }

  const priced = bom.lines.filter((l) => typeof l.est_price_usd === 'number');

  return (
    <>
      <div className="card pad" style={{ marginBottom: 14 }}>
        <b>{bom.title}</b>
        <div className="dim small" style={{ marginTop: 4 }}>{bom.basis}</div>
        <ul className="small dim" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {bom.rules.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
        <div className="dim small" style={{ marginTop: 8 }}>
          {bom.lines.length} lines · {priced.length} with a listed price (LN list, not quotes)
        </div>
      </div>

      {GROUPS.map((g) => {
        const lines = bom.lines.filter((l) => l.group === g);
        const listText = lines.map((l) => `${orderable(l.pn).join(' / ') || (l.ln_sku ? `LN ${l.ln_sku}` : '')} x ${l.qty || ''}  ${l.name}`.trim()).join('\n');
        const queueable = lines.filter((l) => l.part_id && PART_INDEX[l.part_id] && ['needed', 'not-needed'].includes((state.parts[l.part_id] ?? DEFAULT_PART).status));
        return (
          <div key={g}>
            <h2 className="section" style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ flex: 1 }}>{bom.groups[g]}</span>
              <span className="mono dim small">{lines.length}</span>
              <button className="btn sm" onClick={() => void copy(g, listText)}>{copied === g ? 'Copied' : 'Copy list'}</button>
              {g === 'porsche-pn' && queueable.length > 0 && (
                <button className="btn sm primary" onClick={() => queueForPricing(lines)}
                  title="Marks these parts Researching so the price agent quotes them across your vendor accounts.">
                  Queue {queueable.length} for pricing
                </button>
              )}
            </h2>
            <div className="card">
              {lines.map((l) => {
                const p = l.part_id ? PART_INDEX[l.part_id] : undefined;
                const st = p ? (state.parts[p.id] ?? DEFAULT_PART).status : null;
                const pns = l.pn ?? [];
                return (
                  <div className="part" key={l.id} onClick={p ? () => onOpenPart(p.id) : undefined}
                    style={p ? undefined : { cursor: 'default' }}>
                    <div className="nm" style={{ minWidth: 0 }}>
                      <b>{l.name}</b>
                      <div className="pn">
                        {[l.qty ? `×${l.qty}` : '', pns.join(' · ')].filter(Boolean).join(' · ')}
                      </div>
                      {l.ln_sku && <div className="small" style={{ color: 'var(--accent)' }}>LN {l.ln_sku}</div>}
                      {l.pn_alt?.length ? <div className="dim small">{l.pn_alt.join(' · ')}</div> : null}
                      {l.replaces?.length ? <div className="dim small">replaces {l.replaces.join('; ')}</div> : null}
                      {l.catalogue && <div className="dim small">{l.catalogue}</div>}
                      {l.note && <div className="dim small" style={{ marginTop: 3 }}>{l.note}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flex: 'none' }}>
                      {typeof l.est_price_usd === 'number' && (
                        <div className="price" title={l.price_source ?? ''}>
                          {l.est_price_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                        </div>
                      )}
                      {st && <span className={`chip ${st}`} style={{ marginTop: 4 }}>{st}</span>}
                      {g === 'not-needed' && <span className="chip" style={{ marginTop: 4 }}>skip</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="dim small" style={{ marginTop: 12 }}>
        Kat 021 numbers are a 2017 snapshot. Where two numbers are listed, Gaudin Porsche settles which one is current.
        Data: public/techdb/bom.json.
      </p>
    </>
  );
}
