import type { Bom, Fastener, Figure, Procedure, StandardTorque, TechDb, TechDoc, TechIndex } from './types';

/**
 * The technical database is a folder of JSON served next to the app (public/techdb/).
 * It is fetched, never imported, so the same files can be read by anything else:
 * curl, a spreadsheet, another app, the agents.
 */
const BASE = `${import.meta.env.BASE_URL}techdb/`;

async function get<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`techdb: ${path} ${r.status}`);
  return (await r.json()) as T;
}

let dbPromise: Promise<TechDb> | null = null;
const procCache = new Map<string, Promise<Procedure | null>>();

export function loadTechDb(): Promise<TechDb> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const [index, docs, fas, figs, standard] = await Promise.all([
        get<TechIndex>('index.json'),
        get<{ documents: TechDoc[] }>('documents.json'),
        get<{ fasteners: Fastener[] }>('fasteners.json'),
        get<{ figures: Figure[] }>('figures.json'),
        get<StandardTorque>('torque-standard.json').catch(() => undefined),
      ]);
      return {
        index,
        documents: Object.fromEntries(docs.documents.map((d) => [d.id, d])),
        fasteners: Object.fromEntries(fas.fasteners.map((f) => [f.id, f])),
        figures: Object.fromEntries(figs.figures.map((f) => [f.id, f])),
        standard,
      };
    })();
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

export function loadProcedure(id: string): Promise<Procedure | null> {
  if (!procCache.has(id)) {
    procCache.set(id, get<Procedure>(`procedures/${id}.json`).catch(() => null));
  }
  return procCache.get(id)!;
}

export function figureUrl(file: string): string {
  return `${BASE}figures/${file}`;
}

/** A procedure's fastener entry is either a reference into fasteners.json or an inline row. */
export function resolveFastener(db: TechDb, entry: { ref?: string } & Partial<Fastener>): Fastener {
  if (entry.ref && db.fasteners[entry.ref]) return { ...db.fasteners[entry.ref], ...stripRef(entry) };
  return { id: entry.id ?? entry.ref ?? 'inline', name: entry.name ?? entry.ref ?? '', stages: entry.stages ?? [], sources: entry.sources ?? [], ...stripRef(entry) } as Fastener;
}
function stripRef<T extends { ref?: string }>(e: T): Omit<T, 'ref'> {
  const { ref: _ref, ...rest } = e;
  return rest;
}

export function docLabel(db: TechDb, s: { doc: string; ref: string }): string {
  const d = db.documents[s.doc];
  const short = d ? shortTitle(d) : s.doc === 'as-noted' ? '' : s.doc;
  return short ? `${short}, ${s.ref}` : s.ref;
}
function shortTitle(d: TechDoc): string {
  switch (d.id) {
    case 'wsm-g1p1': return 'WSM Gr.1 Part 1';
    case 'wsm-g1p2': return 'WSM Gr.1 Part 2';
    case 'wsm-g0': return 'WSM Gr.0';
    case 'wsm-g2': return 'WSM Gr.2';
    case 'si-2002': return 'Service Information MY2002';
    case 'kat-021': return 'Kat 021';
    case 'torque-book': return 'Fastening Specifications 996';
    case 'research': return 'research notes';
    case 'web-wm': return 'web transcription (unverified)';
    default: return d.title.split(',')[0];
  }
}

/** A source counts as verified when it is a document in hand that is not research. */
export function isVerified(db: TechDb, f: { sources?: { doc: string }[]; open?: boolean }): boolean {
  if (f.open) return false;
  return (f.sources ?? []).some((s) => s.doc === 'as-noted' || (db.documents[s.doc]?.in_hand && !['research', 'web-wm'].includes(s.doc)));
}

let bomPromise: Promise<Bom> | null = null;
export function loadBom(): Promise<Bom> {
  if (!bomPromise) { bomPromise = get<Bom>('bom.json'); bomPromise.catch(() => { bomPromise = null; }); }
  return bomPromise;
}
