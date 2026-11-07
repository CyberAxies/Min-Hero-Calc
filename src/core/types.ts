/** Shared value types that are independent of any particular game pack. */

export interface Stats {
  health: number;
  energy: number;
  attack: number;
  healing: number;
  speed: number;
}

export type TypeId = string;

/**
 * One point-spend record in a skill tree.
 * `key` is encoded as `tree:col:row` so it can be stored and shared compactly.
 */
export interface BuildAllocation {
  tree: number;
  col: number;
  row: number;
  points: number;
}

export interface BuildState {
  id: string;
  name: string;
  minionId: string;
  primaryTree: number;
  /** Allocation key (`tree:col:row`) to purchased points in that node. */
  allocations: Record<string, number>;
  updatedAt: number;
}

export interface SavedTeam {
  id: string;
  name: string;
  slots: Array<string | null>;
  enemy: Array<string | null>;
  builds: Array<BuildState | null>;
  updatedAt: number;
}

export type CoverageMode = 'builds' | 'learnable';

export type GemStat = 'health' | 'energy' | 'attack' | 'healing' | 'speed';

export interface GemSlot {
  stat: GemStat;
  /** 1–11; the game clamps higher tiers to the tier-11 shape. */
  tier: number;
  /** Roll percentage, 60–140 (the source rolls 1 ± 0.4). */
  quality: number;
}

/** One entry per socket; `null` is an empty socket. */
export type GemLoadout = Array<GemSlot | null>;

export interface Settings {
  coverageMode: CoverageMode;
}

export interface AppState {
  v: 1;
  team: Array<string | null>;
  enemy: Array<string | null>;
  slotBuilds: Array<BuildState | null>;
  builds: Record<string, BuildState>;
  savedTeams: Record<string, SavedTeam>;
  /** Equipped gems, keyed by minion id (they belong to the minion, not a slot). */
  loadouts: Record<string, GemLoadout>;
  settings: Settings;
}

export interface SharePayload {
  v: 1;
  team?: Array<string | null>;
  enemy?: Array<string | null>;
  builds?: Array<BuildState | null>;
}
