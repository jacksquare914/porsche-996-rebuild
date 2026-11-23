/** Shapes of the files in public/techdb/. The app reads them at runtime; nothing here is bundled. */

export interface SourceRef { doc: string; ref: string }

export interface TechDoc {
  id: string; kind: string; title: string; edition?: string; pages?: number;
  in_hand: boolean; where?: string; coverage?: string; caveat?: string;
}

export interface TorqueStage { label: string; nm?: number | null; angle?: number | null; undo?: boolean }

export interface Fastener {
  id: string; ill?: string; pos?: string | number; name: string; thread?: string;
  qty?: number | string; per_bank?: number; pn?: string[]; reuse?: string; lube?: string;
  stages: TorqueStage[]; sequence_figure?: string;
  /** Confirmed for M96.0X by the torque book. */
  m03?: boolean;
  /** Only the M96/01 edition of the WSM covers it so far. */
  m01_only?: boolean;
  caveat?: string;
  /** Sources disagree. The app blocks approval of any step that uses the row. */
  conflict?: string;
  /** No usable source yet. Shown, never trusted. */
  open?: boolean;
  note?: string;
  sources: SourceRef[];
}

export interface FigureMap {
  outline: 'head' | 'case' | 'bearing';
  viewBox: [number, number, number, number];
  /** [x, y, sequence number] */
  bolts: [number, number, number][];
  order: number[];
  stages: string[];
  note?: string;
}

export interface Figure {
  id: string; kind: 'sequence' | 'exploded' | 'photo'; title: string; file: string; full?: string;
  legend?: string; sources: SourceRef[]; map?: FigureMap;
}

export type NoticeKind = 'danger' | 'warning' | 'caution' | 'note' | 'source' | 'conflict';
export interface Notice { kind: NoticeKind; text: string; sources?: SourceRef[] }

export interface StepRef {
  fastener?: string; tool?: string; part?: string; spec?: string;
  figure?: string; sequence?: boolean; bead?: boolean; timer?: boolean;
}
export interface ProcStep { no: number; text: string; refs: StepRef[] }

export interface ProcFastenerRef extends Partial<Fastener> { ref?: string }

export interface Tool { name: string; special?: string | null; note?: string }

export interface Spec {
  id: string; name: string; unit: string; min: number; max: number; wear_limit?: number;
  sources: SourceRef[];
}

export interface Procedure {
  schema: string; id: string; status: 'authored' | 'draft'; title: string; phase: string;
  rg: number | null; rg_title?: string; op: string | null; op_title?: string; wsm_page?: string;
  imprint?: string; time_h: number; timer_s?: number;
  notices: Notice[]; steps: ProcStep[]; fasteners: ProcFastenerRef[]; tools: Tool[];
  specs: Spec[]; spec_note?: string; parts: string[]; figures: string[]; sources: SourceRef[];
}

export interface TechIndex {
  schema: string; generated_at: string;
  car: { year: number; model: string; engine: string; vin_range: string };
  documents: Pick<TechDoc, 'id' | 'title' | 'kind' | 'in_hand'>[];
  counts: { procedures: number; authored: number; fasteners: number; figures: number };
  procedures: { id: string; title: string; phase: string; rg: number | null; op: string | null; status: string; time_h: number; wsm_page: string | null }[];
}

export interface TechDb {
  index: TechIndex;
  documents: Record<string, TechDoc>;
  fasteners: Record<string, Fastener>;
  figures: Record<string, Figure>;
}

/** public/techdb/bom.json */
export interface BomLine {
  group: 'ln' | 'porsche-pn' | 'inspect' | 'not-needed';
  id: string; name: string; qty?: number;
  /** Catalogue-verified Porsche numbers. */
  pn?: string[];
  /** Other numbers with the reason they are not yet trusted. */
  pn_alt?: string[];
  /** OEM numbers an LN item stands in for. */
  replaces?: string[];
  ln_sku?: string;
  part_id?: string | null; catalogue?: string | null; note?: string;
  est_price_usd?: number; price_source?: string; source?: string;
  price_fcp_wholesale_usd?: number; price_fcp_wholesale_est_usd?: number; price_ssf_est_usd?: number;
  list_price_usd?: number; list_price_source?: string; price_rusnak_est_usd?: number;
  fcp_sku?: string;
}
export interface Bom {
  schema: string; title: string; car: string; basis: string; rules: string[];
  groups: Record<BomLine['group'], string>; generated_at: string; lines: BomLine[];
}
