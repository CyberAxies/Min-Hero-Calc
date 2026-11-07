import { MINION_BY_ID } from '../packs/minhero/data';
import { createBuild, parseAllocationKey, validateBuild } from './builds';
import { sanitizeLoadout } from './gems';
import type { BuildState, GemLoadout } from './types';

export interface SharedBuild {
  minionId: string;
  primaryTree: number;
  allocations: Record<string, number>;
}

export interface SharedTeamPayload {
  v: 1;
  team: Array<string | null>;
  enemy: Array<string | null>;
  builds: Array<SharedBuild | null>;
  /** Optional equipped gems, keyed by minion id. */
  gems?: Record<string, GemLoadout>;
}

interface SharedBuildPayload extends SharedBuild {
  v: 1;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(token: string): string {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    Math.ceil(token.length / 4) * 4,
    '=',
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKnownMinion(value: unknown): value is string {
  return typeof value === 'string' && MINION_BY_ID.has(value);
}

function normalizeSlots(
  value: unknown,
  errors: string[],
  label: string,
): Array<string | null> {
  if (!Array.isArray(value)) return [null, null, null, null, null];
  return Array.from({ length: 5 }, (_, index) => {
    const item = value[index];
    if (item === null || item === undefined) return null;
    if (!isKnownMinion(item)) {
      errors.push(`${label} slot ${index + 1} references an unknown minion.`);
      return null;
    }
    return item;
  });
}

function toSharedBuild(build: BuildState): SharedBuild {
  return {
    minionId: build.minionId,
    primaryTree: build.primaryTree,
    allocations: build.allocations,
  };
}

function validateSharedBuild(value: unknown, errors: string[]): SharedBuild | null {
  if (!isRecord(value)) {
    errors.push('A shared build is not an object.');
    return null;
  }
  if (!isKnownMinion(value.minionId)) {
    errors.push('A shared build references an unknown minion.');
    return null;
  }
  if (
    typeof value.primaryTree !== 'number' ||
    !Number.isInteger(value.primaryTree) ||
    value.primaryTree < -1 ||
    value.primaryTree > 2
  ) {
    errors.push(`Invalid specialization for ${value.minionId}.`);
    return null;
  }
  if (!isRecord(value.allocations)) {
    errors.push(`Missing allocations for ${value.minionId}.`);
    return null;
  }
  const allocations: Record<string, number> = {};
  for (const [key, points] of Object.entries(value.allocations)) {
    if (!parseAllocationKey(key)) {
      errors.push(`Invalid allocation key ${key}.`);
      return null;
    }
    if (typeof points !== 'number' || !Number.isInteger(points) || points <= 0) {
      errors.push(`Invalid allocation points for ${key}.`);
      return null;
    }
    allocations[key] = points;
  }
  const shared: SharedBuild = {
    minionId: value.minionId,
    primaryTree: value.primaryTree,
    allocations,
  };
  const build = createBuild(shared.minionId, shared.primaryTree, 'shared-build', 'Shared build');
  build.allocations = shared.allocations;
  const validation = validateBuild(build);
  if (!validation.valid) {
    errors.push(`Build for ${shared.minionId} is invalid: ${validation.errors[0]?.message ?? 'unknown error'}`);
    return null;
  }
  return shared;
}

export function encodeTeamShare(
  team: ReadonlyArray<string | null>,
  enemy: ReadonlyArray<string | null>,
  builds: ReadonlyArray<BuildState | null>,
  loadouts?: Readonly<Record<string, GemLoadout>>,
): string {
  const gems: Record<string, GemLoadout> = {};
  for (const minionId of team) {
    if (!minionId) continue;
    const loadout = loadouts?.[minionId];
    if (!loadout) continue;
    const safe = sanitizeLoadout(loadout);
    if (safe.some((gem) => gem !== null)) gems[minionId] = safe;
  }
  const payload: SharedTeamPayload = {
    v: 1,
    team: Array.from({ length: 5 }, (_, index) => team[index] ?? null),
    enemy: Array.from({ length: 5 }, (_, index) => enemy[index] ?? null),
    builds: Array.from({ length: 5 }, (_, index) => {
      const build = builds[index];
      return build ? toSharedBuild(build) : null;
    }),
    gems,
  };
  return toBase64Url(JSON.stringify(payload));
}

export function decodeTeamShare(token: string): { payload: SharedTeamPayload; errors: string[] } {
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(token));
  } catch {
    return {
      payload: { v: 1, team: [null, null, null, null, null], enemy: [null, null, null, null, null], builds: [null, null, null, null, null] },
      errors: ['That share link is not valid.'],
    };
  }
  if (!isRecord(raw) || raw.v !== 1) {
    return {
      payload: { v: 1, team: [null, null, null, null, null], enemy: [null, null, null, null, null], builds: [null, null, null, null, null] },
      errors: ['That share link uses an unsupported version.'],
    };
  }
  const team = normalizeSlots(raw.team, errors, 'Team');
  const enemy = normalizeSlots(raw.enemy, errors, 'Enemy');
  const builds = Array.from({ length: 5 }, (_, index) => {
    const value = Array.isArray(raw.builds) ? raw.builds[index] : null;
    return value === null || value === undefined
      ? null
      : validateSharedBuild(value, errors);
  });
  for (let index = 0; index < 5; index += 1) {
    const build = builds[index];
    if (build && team[index] !== build.minionId) {
      errors.push(`Build slot ${index + 1} does not match its team slot.`);
      builds[index] = null;
    }
  }
  const gems: Record<string, GemLoadout> = {};
  if (isRecord(raw.gems)) {
    for (const [minionId, value] of Object.entries(raw.gems)) {
      if (!isKnownMinion(minionId)) continue;
      const loadout = sanitizeLoadout(value);
      if (loadout.some((gem) => gem !== null)) gems[minionId] = loadout;
    }
  }
  return { payload: { v: 1, team, enemy, builds, gems }, errors };
}

export function encodeBuildShare(build: BuildState): string {
  const payload: SharedBuildPayload = { v: 1, ...toSharedBuild(build) };
  return toBase64Url(JSON.stringify(payload));
}

export function decodeBuildShare(token: string): { build: SharedBuild | null; errors: string[] } {
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(token));
  } catch {
    return { build: null, errors: ['That build link is not valid.'] };
  }
  if (!isRecord(raw) || raw.v !== 1) {
    return { build: null, errors: ['That build link uses an unsupported version.'] };
  }
  const build = validateSharedBuild(raw, errors);
  return { build, errors };
}
