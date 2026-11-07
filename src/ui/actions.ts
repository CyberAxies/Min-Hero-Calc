import { createBuild } from '../core/builds';
import { gemSlotCount, sanitizeLoadout } from '../core/gems';
import type { SharedBuild, SharedTeamPayload } from '../core/share';
import { getState, newId, updateState } from '../core/store';
import type { AppState, BuildState, CoverageMode, GemLoadout, SavedTeam } from '../core/types';
import type { Team } from '../core/coverage';
import { MINION_BY_ID } from '../packs/minhero/data';

const TEAM_SIZE = 5;

export function cloneBuild(build: BuildState): BuildState {
  return { ...build, allocations: { ...build.allocations } };
}

export function defaultBuildName(minionId: string): string {
  return `${MINION_BY_ID.get(minionId)?.name ?? minionId} build`;
}

export function makeBuild(
  minionId: string,
  primaryTree = -1,
  name = defaultBuildName(minionId),
  id = newId('build'),
): BuildState {
  return createBuild(minionId, primaryTree, id, name);
}

export function buildFromShared(
  shared: SharedBuild,
  name = defaultBuildName(shared.minionId),
  id = newId('build'),
): BuildState {
  const build = makeBuild(shared.minionId, shared.primaryTree, name, id);
  build.allocations = { ...shared.allocations };
  build.updatedAt = Date.now();
  return build;
}

export function setTeamSlot(slot: number, minionId: string | null): void {
  updateState((draft) => {
    const previous = draft.team[slot];
    draft.team[slot] = minionId;
    if (!minionId) {
      draft.slotBuilds[slot] = null;
      return;
    }
    const existing = draft.slotBuilds[slot];
    if (previous === minionId && existing?.minionId === minionId) return;
    const draftBuild = draft.builds[`draft:${minionId}`];
    draft.slotBuilds[slot] =
      draftBuild && draftBuild.minionId === minionId
        ? cloneBuild(draftBuild)
        : makeBuild(minionId);
  });
}

export function setEnemySlot(slot: number, minionId: string | null): void {
  updateState((draft) => {
    draft.enemy[slot] = minionId;
  });
}

export function updateSlotBuild(slot: number, build: BuildState): void {
  updateState((draft) => {
    draft.slotBuilds[slot] = build;
  });
}

export function updateLibraryBuild(id: string, build: BuildState): void {
  updateState((draft) => {
    draft.builds[id] = build;
  });
}

export function ensureDraftBuild(minionId: string): string {
  const key = `draft:${minionId}`;
  if (!getState().builds[key]) {
    updateState((draft) => {
      if (!draft.builds[key]) {
        draft.builds[key] = makeBuild(minionId, -1, defaultBuildName(minionId), key);
      }
    });
  }
  return key;
}

export function addBuildToLibrary(build: BuildState, name?: string): string {
  const id = newId('build');
  updateState((draft) => {
    draft.builds[id] = {
      ...cloneBuild(build),
      id,
      name: name ?? build.name,
      updatedAt: Date.now(),
    };
  });
  return id;
}

export function deleteBuild(id: string): void {
  updateState((draft) => {
    delete draft.builds[id];
  });
}

export function setCoverageMode(mode: CoverageMode): void {
  updateState((draft) => {
    draft.settings.coverageMode = mode;
  });
}

export function clearTeam(): void {
  updateState((draft) => {
    draft.team = Array.from({ length: TEAM_SIZE }, () => null);
    draft.enemy = Array.from({ length: TEAM_SIZE }, () => null);
    draft.slotBuilds = Array.from({ length: TEAM_SIZE }, () => null);
  });
}

export function saveCurrentTeam(name: string): string {
  const state = getState();
  const id = newId('team');
  const saved: SavedTeam = {
    id,
    name,
    slots: [...state.team],
    enemy: [...state.enemy],
    builds: state.slotBuilds.map((build) => (build ? cloneBuild(build) : null)),
    updatedAt: Date.now(),
  };
  updateState((draft) => {
    draft.savedTeams[id] = saved;
  });
  return id;
}

export function loadSavedTeam(id: string): boolean {
  const saved = getState().savedTeams[id];
  if (!saved) return false;
  updateState((draft) => {
    draft.team = [...saved.slots];
    draft.enemy = [...saved.enemy];
    draft.slotBuilds = saved.builds.map((build, index) => {
      if (!build || saved.slots[index] !== build.minionId) return null;
      return cloneBuild(build);
    });
  });
  return true;
}

export function deleteSavedTeam(id: string): void {
  updateState((draft) => {
    delete draft.savedTeams[id];
  });
}

export function loadSharedTeam(payload: SharedTeamPayload): void {
  updateState((draft) => {
    draft.team = Array.from({ length: TEAM_SIZE }, (_, index) => payload.team[index] ?? null);
    draft.enemy = Array.from({ length: TEAM_SIZE }, (_, index) => payload.enemy[index] ?? null);
    draft.slotBuilds = draft.team.map((minionId, index) => {
      if (!minionId) return null;
      const shared = payload.builds[index];
      if (shared && shared.minionId === minionId) return buildFromShared(shared);
      return makeBuild(minionId);
    });
    for (const [minionId, loadout] of Object.entries(payload.gems ?? {})) {
      const minion = MINION_BY_ID.get(minionId);
      if (!minion) continue;
      const safe = sanitizeLoadout(loadout, gemSlotCount(minion));
      if (safe.some((gem) => gem !== null)) draft.loadouts[minionId] = safe;
    }
  });
}

/** Replaces the equipped gems of one minion; empty loadouts are removed. */
export function setGemLoadout(minionId: string, loadout: GemLoadout): void {
  const minion = MINION_BY_ID.get(minionId);
  if (!minion) return;
  const safe = sanitizeLoadout(loadout, gemSlotCount(minion));
  updateState((draft) => {
    if (safe.some((gem) => gem !== null)) draft.loadouts[minionId] = safe;
    else delete draft.loadouts[minionId];
  });
}

export function applySharedBuild(build: BuildState, shared: SharedBuild): BuildState {
  return {
    ...build,
    minionId: shared.minionId,
    primaryTree: shared.primaryTree,
    allocations: { ...shared.allocations },
    updatedAt: Date.now(),
  };
}

export function teamEntries(state: Readonly<AppState> = getState(), enemy = false): Team {
  const slots = enemy ? state.enemy : state.team;
  return slots.map((minionId, index) => {
    if (!minionId) return null;
    const build = enemy ? null : state.slotBuilds[index];
    return {
      minionId,
      build: build && build.minionId === minionId ? build : null,
    };
  });
}

export function teamSlotFor(minionId: string): number {
  return getState().team.findIndex((id) => id === minionId);
}

export function firstEmptyTeamSlot(): number {
  return getState().team.findIndex((id) => id === null);
}
