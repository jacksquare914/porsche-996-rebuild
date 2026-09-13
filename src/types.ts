export type Phase =
  | 'prep' | 'removal' | 'teardown' | 'inspection'
  | 'machining' | 'assembly' | 'install' | 'startup';

export const PHASES: Phase[] = [
  'prep', 'removal', 'teardown', 'inspection',
  'machining', 'assembly', 'install', 'startup',
];

export const PHASE_LABEL: Record<Phase, string> = {
  prep: 'Prep & Diagnostics',
  removal: 'Engine Out',
  teardown: 'Teardown',
  inspection: 'Inspection',
  machining: 'Machining',
  assembly: 'Assembly',
  install: 'Engine In',
  startup: 'Startup & Break-in',
};

export interface TorqueSpec {
  fastener: string;
  spec: string;
  note?: string;
}

export interface Step {
  id: string;
  title: string;
  phase: Phase;
  est_hours: number;
  notes?: string;
  torque?: TorqueSpec[];
  tools?: string[];
  part_ids?: string[];
  children?: Step[];
}

export type StepStatus = 'todo' | 'active' | 'blocked' | 'done';

export interface StepState {
  status: StepStatus;
  actual_hours?: number;
  started_at?: string;
  done_at?: string;
  note?: string;
}

export type PartCategory =
  | 'engine-internals' | 'gaskets-seals' | 'ims-rms' | 'cooling'
  | 'fuel-ignition' | 'drivetrain' | 'fluids' | 'hardware'
  | 'tools' | 'consumables';

export const CATEGORY_LABEL: Record<PartCategory, string> = {
  'engine-internals': 'Engine Internals',
  'gaskets-seals': 'Gaskets & Seals',
  'ims-rms': 'IMS & RMS',
  cooling: 'Cooling',
  'fuel-ignition': 'Fuel & Ignition',
  drivetrain: 'Drivetrain',
  fluids: 'Fluids',
  hardware: 'Hardware',
  tools: 'Tools',
  consumables: 'Consumables',
};

export interface Part {
  id: string;
  name: string;
  category: PartCategory;
  oem_part_numbers?: string[];
  alt_brands?: { brand: string; part: string }[];
  qty: number;
  critical?: boolean;
  replace_rule?: 'always' | 'inspect-first' | 'as-needed';
  est_price_usd?: number | null;
  notes?: string;
}

export type PartStatus =
  | 'not-needed' | 'needed' | 'researching' | 'ordered' | 'received' | 'installed';

export const PART_STATUSES: PartStatus[] = [
  'not-needed', 'needed', 'researching', 'ordered', 'received', 'installed',
];

export interface PartState {
  status: PartStatus;
  qty_override?: number;
  vendor?: string;
  unit_price?: number;
  order_no?: string;
  ordered_at?: string;
  received_at?: string;
  note?: string;
}

/** One vendor price observation, written by the price agent or by hand. */
export interface PriceQuote {
  id: string;
  part_id: string;
  vendor: string;
  sku?: string;
  brand?: string;
  price_usd: number | null;
  shipping_usd?: number | null;
  in_stock?: boolean | null;
  url?: string;
  checked_at: string;
  note?: string;
}

export interface LogEntry {
  id: string;
  step_id?: string;
  at: string;
  title?: string;
  body?: string;
  /** Drive file ids for photos attached to this entry. */
  photos: PhotoRef[];
  hours?: number;
  tags?: string[];
}

export interface PhotoRef {
  fileId: string;
  name: string;
  /** Drive thumbnailLink, refreshed on load. */
  thumb?: string;
  caption?: string;
  /** Marked by the content agent or by hand as a hero shot. */
  hero?: boolean;
}

export type ContentKind = 'ig-post' | 'reel' | 'build-log';

export interface ContentDraft {
  id: string;
  kind: ContentKind;
  created_at: string;
  title: string;
  body: string;
  /** log entry ids this draft was generated from */
  source_log_ids?: string[];
  photo_picks?: string[];
  hashtags?: string[];
  status: 'draft' | 'approved' | 'posted';
}

/**
 * Read by the "Sunday Instagram batch — Meister Without" scheduled task.
 * Off by default: when `include_in_sunday_batch` is false the batch ignores this
 * rebuild entirely and builds its five tickets from the shop and the store, exactly
 * as it does today. Flip it on in the Content tab in any week you want the rebuild
 * mined for posts.
 */
export interface InstagramOptIn {
  include_in_sunday_batch: boolean;
  /** Steer one week's batch — "lead with the bore scoring", "keep it to the IMS". */
  focus?: string;
  /** Set automatically when the switch is flipped, so the batch can tell how stale it is. */
  updated_at?: string;
}

export interface RebuildState {
  version: number;
  car: {
    year: number;
    model: string;
    engine: string;
    vin?: string;
    engine_no?: string;
    mileage?: number;
  };
  instagram?: InstagramOptIn;
  budget_usd?: number;
  steps: Record<string, StepState>;
  parts: Record<string, PartState>;
  quotes: PriceQuote[];
  log: LogEntry[];
  content: ContentDraft[];
  updated_at: string;
}

export function emptyState(): RebuildState {
  return {
    version: 1,
    car: {
      year: 2003,
      model: '996 Targa',
      engine: 'M96.03 3.6L',
    },
    instagram: { include_in_sunday_batch: false },
    steps: {},
    parts: {},
    quotes: [],
    log: [],
    content: [],
    updated_at: new Date().toISOString(),
  };
}
