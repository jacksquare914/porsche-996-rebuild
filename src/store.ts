import { createContext, useContext } from 'react';
import type { RebuildState, Step, Part, StepState, PartState } from './types';
import { emptyState } from './types';
import stepsData from './data/steps.json';
import partsData from './data/parts.json';

export const STEPS = stepsData as unknown as Step[];
export const PARTS = partsData as unknown as Part[];

export const STEP_INDEX: Record<string, Step> = {};
export const STEP_PARENT: Record<string, string | null> = {};
(function index(nodes: Step[], parent: string | null) {
  for (const n of nodes) {
    STEP_INDEX[n.id] = n;
    STEP_PARENT[n.id] = parent;
    if (n.children?.length) index(n.children, n.id);
  }
})(STEPS, null);

export const PART_INDEX: Record<string, Part> = Object.fromEntries(
  PARTS.map((p) => [p.id, p]),
);

export const DEFAULT_STEP: StepState = { status: 'todo' };
export const DEFAULT_PART: PartState = { status: 'needed' };

export function leaves(step: Step): Step[] {
  if (!step.children?.length) return [step];
  return step.children.flatMap(leaves);
}

export function allLeaves(): Step[] {
  return STEPS.flatMap(leaves);
}

/** Progress for a step = fraction of its leaf descendants marked done, weighted by est_hours. */
export function progressOf(step: Step, states: Record<string, StepState>): number {
  const ls = leaves(step);
  const total = ls.reduce((s, l) => s + (l.est_hours || 1), 0) || 1;
  const done = ls.reduce(
    (s, l) => s + ((states[l.id] ?? DEFAULT_STEP).status === 'done' ? l.est_hours || 1 : 0),
    0,
  );
  return done / total;
}

export function hoursOf(step: Step): number {
  return leaves(step).reduce((s, l) => s + (l.est_hours || 0), 0);
}

export interface PartLine {
  part: Part;
  state: PartState;
  qty: number;
  unit: number | null;
  total: number | null;
}

export function partLine(part: Part, states: Record<string, PartState>): PartLine {
  const state = states[part.id] ?? DEFAULT_PART;
  const qty = state.qty_override ?? part.qty ?? 1;
  const unit = state.unit_price ?? part.est_price_usd ?? null;
  return { part, state, qty, unit, total: unit === null ? null : unit * qty };
}

export interface Budget {
  committed: number;
  estimated: number;
  unpriced: number;
}

export function budget(states: Record<string, PartState>): Budget {
  let committed = 0;
  let estimated = 0;
  let unpriced = 0;
  for (const part of PARTS) {
    const line = partLine(part, states);
    if (line.state.status === 'not-needed') continue;
    if (line.total === null) {
      unpriced += 1;
      continue;
    }
    estimated += line.total;
    if (['ordered', 'received', 'installed'].includes(line.state.status)) {
      committed += line.total;
    }
  }
  return { committed, estimated, unpriced };
}

/** Which steps reference this part. */
export const PART_STEPS: Record<string, string[]> = {};
for (const id of Object.keys(STEP_INDEX)) {
  for (const pid of STEP_INDEX[id].part_ids ?? []) {
    (PART_STEPS[pid] ??= []).push(id);
  }
}

export interface StoreApi {
  state: RebuildState;
  update: (fn: (draft: RebuildState) => void) => void;
  status: 'local' | 'syncing' | 'synced' | 'error' | 'signed-out';
  statusMessage?: string;
  signIn: () => void;
  signOut: () => void;
  reload: () => void;
}

export const StoreContext = createContext<StoreApi>({
  state: emptyState(),
  update: () => {},
  status: 'signed-out',
  signIn: () => {},
  signOut: () => {},
  reload: () => {},
});

export function useStore(): StoreApi {
  return useContext(StoreContext);
}

export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n >= 100 ? 0 : 2,
  });
}

export function fmtDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function uid(prefix = 'x'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
