import { MINHERO_RULES } from '../packs/minhero/rules';
import { sanitizeLoadout } from './gems';
import type { AppState, BuildState, GemLoadout, SavedTeam, Settings } from './types';

/**
 * Versioned local persistence. The store is deliberately tiny: views read the
 * current state on render, and mutations trigger a route refresh from main.ts.
 */
export const STORAGE_KEY = 'mhc:v1';

const TEAM_SIZE = MINHERO_RULES.teamSize;

function emptySlots<T>(value: T): T[] {
  return Array.from({ length: TEAM_SIZE }, () => value);
}

export function createDefaultState(): AppState {
  return {
    v: 1,
    team: emptySlots<string | null>(null),
    enemy: emptySlots<string | null>(null),
    slotBuilds: emptySlots<BuildState | null>(null),
    builds: {},
    savedTeams: {},
    loadouts: {},
    settings: { coverageMode: 'builds' },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStringSlots(value: unknown): Array<string | null> {
  if (!Array.isArray(value)) return emptySlots<string | null>(null);
  return Array.from({ length: TEAM_SIZE }, (_, index) => {
    const item = value[index];
    return typeof item === 'string' ? item : null;
  });
}

function isBuildState(value: unknown): value is BuildState {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.minionId !== 'string' ||
    typeof value.primaryTree !== 'number' ||
    typeof value.updatedAt !== 'number' ||
    !isRecord(value.allocations)
  ) {
    return false;
  }
  return Object.values(value.allocations).every(
    (points) => typeof points === 'number' && Number.isFinite(points) && points >= 0,
  );
}

function normalizeBuildSlots(value: unknown): Array<BuildState | null> {
  if (!Array.isArray(value)) return emptySlots<BuildState | null>(null);
  return Array.from({ length: TEAM_SIZE }, (_, index) => {
    const item = value[index];
    return isBuildState(item) ? item : null;
  });
}

function normalizeBuildLibrary(value: unknown): Record<string, BuildState> {
  if (!isRecord(value)) return {};
  const out: Record<string, BuildState> = {};
  for (const [id, build] of Object.entries(value)) {
    if (isBuildState(build)) out[id] = build;
  }
  return out;
}

function normalizeSavedTeams(value: unknown): Record<string, SavedTeam> {
  if (!isRecord(value)) return {};
  const out: Record<string, SavedTeam> = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry)) continue;
    if (
      typeof entry.name !== 'string' ||
      typeof entry.updatedAt !== 'number'
    ) {
      continue;
    }
    out[id] = {
      id,
      name: entry.name,
      slots: normalizeStringSlots(entry.slots),
      enemy: normalizeStringSlots(entry.enemy),
      builds: normalizeBuildSlots(entry.builds),
      updatedAt: entry.updatedAt,
    };
  }
  return out;
}

function normalizeSettings(value: unknown): Settings {
  if (isRecord(value) && (value.coverageMode === 'builds' || value.coverageMode === 'learnable')) {
    return { coverageMode: value.coverageMode };
  }
  return { coverageMode: 'builds' };
}

function normalizeLoadouts(value: unknown): Record<string, GemLoadout> {
  if (!isRecord(value)) return {};
  const out: Record<string, GemLoadout> = {};
  for (const [minionId, raw] of Object.entries(value)) {
    const loadout = sanitizeLoadout(raw);
    if (loadout.some((gem) => gem !== null)) out[minionId] = loadout;
  }
  return out;
}

/** Accepts older/corrupt payloads without letting them break the app. */
function normalizeState(raw: unknown): AppState {
  const base = createDefaultState();
  if (!isRecord(raw) || raw.v !== 1) return base;
  return {
    v: 1,
    team: normalizeStringSlots(raw.team),
    enemy: normalizeStringSlots(raw.enemy),
    slotBuilds: normalizeBuildSlots(raw.slotBuilds),
    builds: normalizeBuildLibrary(raw.builds),
    savedTeams: normalizeSavedTeams(raw.savedTeams),
    loadouts: normalizeLoadouts(raw.loadouts),
    settings: normalizeSettings(raw.settings),
  };
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredState(): AppState {
  const storage = getStorage();
  if (!storage) return createDefaultState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    return normalizeState(JSON.parse(raw) as unknown);
  } catch {
    return createDefaultState();
  }
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

let state = readStoredState();
const listeners = new Set<(next: Readonly<AppState>) => void>();

function persist(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or a full quota should not prevent in-memory use.
  }
}

function notify(): void {
  for (const listener of listeners) listener(state);
}

export function getState(): Readonly<AppState> {
  return state;
}

/** Applies a mutation, persists it, and notifies subscribers. */
export function updateState(mutator: (draft: AppState) => void): void {
  const draft = clone(state);
  mutator(draft);
  state = draft;
  persist();
  notify();
}

export function resetState(): void {
  state = createDefaultState();
  persist();
  notify();
}

export function subscribe(listener: (next: Readonly<AppState>) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function newId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${uuid}`;
}
