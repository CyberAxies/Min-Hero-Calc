import {
  MINIONS,
  MINION_BY_ID,
  MOVE_BY_ID,
  TREE_BY_ID,
  TYPE_CHART,
} from '../packs/minhero/data';
import type { MinionData, MoveData } from '../packs/minhero/data';
import { purchasedMoveIds } from './builds';
import {
  ONE,
  compare,
  valueOf,
  type Rational,
} from './rational';
import {
  bestAttack,
  defensiveProfile,
  effectiveness,
  isResisted,
  isSuperEffective,
  rating,
  type EffectivenessRating,
} from './typechart';
import type { BuildState, CoverageMode } from './types';

export interface TeamEntry {
  minionId: string;
  build: BuildState | null;
}

export type Team = ReadonlyArray<TeamEntry | null>;

export interface OffenseDefender {
  minionId: string;
  name: string;
  types: string[];
  bestType: string | null;
  multiplier: Rational;
  rating: EffectivenessRating;
  covered: boolean;
  resisted: boolean;
}

export interface OffenseTypeSummary {
  type: string;
  coveredCount: number;
}

export interface OffenseCoverage {
  attackTypes: string[];
  total: number;
  covered: number;
  neutral: number;
  resisted: number;
  uncovered: OffenseDefender[];
  defenders: OffenseDefender[];
  byType: OffenseTypeSummary[];
}

export interface DefenseTypeSummary {
  type: string;
  weakCount: number;
  doubleWeakCount: number;
  resistCount: number;
  doubleResistCount: number;
}

export interface DefenseMember {
  slot: number;
  minionId: string;
  name: string;
  types: string[];
  weakTo: { type: string; multiplier: Rational; rating: EffectivenessRating }[];
  resists: { type: string; multiplier: Rational; rating: EffectivenessRating }[];
}

export interface ThreatTarget {
  slot: number;
  minionId: string;
  multiplier: Rational;
  type: string;
}

export interface DefenseThreat {
  minionId: string;
  name: string;
  types: string[];
  attackType: string;
  bestMultiplier: Rational;
  targets: ThreatTarget[];
}

export interface DefenseCoverage {
  members: DefenseMember[];
  byType: DefenseTypeSummary[];
  threats: DefenseThreat[];
}

export interface MatchupCell {
  teamSlot: number;
  enemySlot: number;
  yourType: string | null;
  yourMultiplier: Rational;
  theirType: string | null;
  theirMultiplier: Rational;
  advantage: 'you' | 'them' | 'even';
}

export interface MatchupResult {
  cells: MatchupCell[];
  favorable: number;
  unfavorable: number;
  even: number;
  score: number;
  margin: number;
}

export interface TypeCombo {
  key: string;
  types: string[];
  minions: string[];
}

export function isDamagingMove(move: MoveData): boolean {
  return (
    move.kind === 'active' &&
    (move.damage > 0 ||
      move.randomDamage > 0 ||
      move.dot > 0 ||
      move.randomDot > 0 ||
      move.percentHealthRemoved > 0)
  );
}

export function learnableMoveIds(minionId: string): string[] {
  const minion = MINION_BY_ID.get(minionId);
  return minion ? learnableMoveIdsWithTrees(minion) : [];
}

function learnableMoveIdsWithTrees(minion: MinionData): string[] {
  const ids = new Set<string>(minion.startingMoves);
  for (const moveId of minion.specializationMoves) ids.add(moveId);
  for (const treeId of minion.treeIds) {
    const tree = TREE_BY_ID.get(treeId);
    if (!tree) continue;
    for (const node of tree.nodes) {
      for (const moveId of node.moves) ids.add(moveId);
    }
  }
  return [...ids];
}

function attackTypesFromMoveIds(
  moveIds: readonly string[],
  fallbackTypes: readonly string[] = [],
): string[] {
  const types = new Set<string>();
  for (const moveId of moveIds) {
    const move = MOVE_BY_ID.get(moveId);
    if (move && move.type && isDamagingMove(move)) types.add(move.type);
  }
  if (types.size === 0) {
    for (const type of fallbackTypes) types.add(type);
  }
  return TYPE_CHART.types.filter((type) => types.has(type));
}

export function slotAttackTypes(entry: TeamEntry, mode: CoverageMode): string[] {
  const minion = MINION_BY_ID.get(entry.minionId);
  if (!minion) return [];
  if (mode === 'builds' && entry.build && entry.build.minionId === entry.minionId) {
    return attackTypesFromMoveIds(purchasedMoveIds(entry.build), minion.types);
  }
  return attackTypesFromMoveIds(learnableMoveIds(entry.minionId), minion.types);
}

export function teamAttackTypes(team: Team, mode: CoverageMode): string[] {
  const types = new Set<string>();
  for (const entry of team) {
    if (!entry) continue;
    for (const type of slotAttackTypes(entry, mode)) types.add(type);
  }
  return TYPE_CHART.types.filter((type) => types.has(type));
}

export function teamOffense(team: Team, mode: CoverageMode): OffenseCoverage {
  const attackTypes = teamAttackTypes(team, mode);
  const defenders: OffenseDefender[] = MINIONS.map((minion) => {
    const best = bestAttack(attackTypes, minion.types);
    return {
      minionId: minion.id,
      name: minion.name,
      types: minion.types,
      bestType: best.type,
      multiplier: best.multiplier,
      rating: rating(best.multiplier),
      covered: isSuperEffective(best.multiplier),
      resisted: isResisted(best.multiplier),
    };
  });
  const covered = defenders.filter((entry) => entry.covered).length;
  const resisted = defenders.filter((entry) => entry.resisted).length;
  const neutral = defenders.length - covered - resisted;
  const byType = TYPE_CHART.types.map((type) => ({
    type,
    coveredCount: MINIONS.filter((minion) =>
      isSuperEffective(effectiveness(type, minion.types)),
    ).length,
  }));
  return {
    attackTypes,
    total: defenders.length,
    covered,
    neutral,
    resisted,
    uncovered: defenders.filter((entry) => !entry.covered),
    defenders,
    byType,
  };
}

export function teamDefense(team: Team): DefenseCoverage {
  const members: DefenseMember[] = [];
  const byType = new Map<string, DefenseTypeSummary>(
    TYPE_CHART.types.map((type) => [
      type,
      {
        type,
        weakCount: 0,
        doubleWeakCount: 0,
        resistCount: 0,
        doubleResistCount: 0,
      },
    ]),
  );

  team.forEach((entry, slot) => {
    if (!entry) return;
    const minion = MINION_BY_ID.get(entry.minionId);
    if (!minion) return;
    const profile = defensiveProfile(minion.types);
    const weakTo = profile.filter((cell) => cell.rating === 'weak' || cell.rating === 'double-weak');
    const resists = profile.filter(
      (cell) => cell.rating === 'resist' || cell.rating === 'double-resist',
    );
    members.push({
      slot,
      minionId: minion.id,
      name: minion.name,
      types: minion.types,
      weakTo,
      resists,
    });
    for (const cell of profile) {
      const summary = byType.get(cell.type);
      if (!summary) continue;
      if (cell.rating === 'weak') summary.weakCount += 1;
      if (cell.rating === 'double-weak') {
        summary.weakCount += 1;
        summary.doubleWeakCount += 1;
      }
      if (cell.rating === 'resist') summary.resistCount += 1;
      if (cell.rating === 'double-resist') {
        summary.resistCount += 1;
        summary.doubleResistCount += 1;
      }
    }
  });

  const teamEntries = team
    .map((entry, slot) => (entry ? { entry, slot } : null))
    .filter((entry): entry is { entry: TeamEntry; slot: number } => entry !== null);
  const threats: DefenseThreat[] = [];
  for (const enemy of MINIONS) {
    const attackTypes = attackTypesFromMoveIds(
      learnableMoveIdsWithTrees(enemy),
      enemy.types,
    );
    if (attackTypes.length === 0) continue;
    const targets: ThreatTarget[] = [];
    let bestMultiplier = ONE;
    let bestType: string | null = null;
    for (const { entry, slot } of teamEntries) {
      const member = MINION_BY_ID.get(entry.minionId);
      if (!member) continue;
      const best = bestAttack(attackTypes, member.types);
      if (isSuperEffective(best.multiplier)) {
        targets.push({
          slot,
          minionId: member.id,
          multiplier: best.multiplier,
          type: best.type ?? attackTypes[0] ?? '',
        });
      }
      if (compare(best.multiplier, bestMultiplier) > 0) {
        bestMultiplier = best.multiplier;
        bestType = best.type;
      }
    }
    if (targets.length > 0 && bestType) {
      threats.push({
        minionId: enemy.id,
        name: enemy.name,
        types: enemy.types,
        attackType: bestType,
        bestMultiplier,
        targets,
      });
    }
  }
  threats.sort(
    (a, b) =>
      b.targets.length - a.targets.length ||
      compare(b.bestMultiplier, a.bestMultiplier) ||
      a.name.localeCompare(b.name),
  );

  return {
    members,
    byType: TYPE_CHART.types.map((type) => byType.get(type)).filter(
      (summary): summary is DefenseTypeSummary => summary !== undefined,
    ),
    threats,
  };
}

export function matchup(
  team: Team,
  enemyTeam: Team,
  mode: CoverageMode,
): MatchupResult {
  const cells: MatchupCell[] = [];
  let favorable = 0;
  let unfavorable = 0;
  let even = 0;
  let margin = 0;

  team.forEach((teamEntry, teamSlot) => {
    if (!teamEntry) return;
    const yourMinion = MINION_BY_ID.get(teamEntry.minionId);
    if (!yourMinion) return;
    const yourTypes = slotAttackTypes(teamEntry, mode);
    enemyTeam.forEach((enemyEntry, enemySlot) => {
      if (!enemyEntry) return;
      const enemyMinion = MINION_BY_ID.get(enemyEntry.minionId);
      if (!enemyMinion) return;
      const enemyTypes = slotAttackTypes(enemyEntry, 'learnable');
      const yours = bestAttack(yourTypes, enemyMinion.types);
      const theirs = bestAttack(enemyTypes, yourMinion.types);
      const compared = compare(yours.multiplier, theirs.multiplier);
      const advantage = compared > 0 ? 'you' : compared < 0 ? 'them' : 'even';
      if (advantage === 'you') favorable += 1;
      else if (advantage === 'them') unfavorable += 1;
      else even += 1;
      margin += valueOf(yours.multiplier) - valueOf(theirs.multiplier);
      cells.push({
        teamSlot,
        enemySlot,
        yourType: yours.type,
        yourMultiplier: yours.multiplier,
        theirType: theirs.type,
        theirMultiplier: theirs.multiplier,
        advantage,
      });
    });
  });

  return {
    cells,
    favorable,
    unfavorable,
    even,
    score: favorable - unfavorable,
    margin,
  };
}

export function uniqueTypeCombos(): TypeCombo[] {
  const combos = new Map<string, TypeCombo>();
  for (const minion of MINIONS) {
    const key = minion.types.join('+');
    const combo = combos.get(key) ?? { key, types: [...minion.types], minions: [] };
    combo.minions.push(minion.id);
    combos.set(key, combo);
  }
  return [...combos.values()].sort(
    (a, b) => b.minions.length - a.minions.length || a.key.localeCompare(b.key),
  );
}
