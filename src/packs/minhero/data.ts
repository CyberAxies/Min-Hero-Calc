import type { Stats } from '../../core/types';
import familiesJson from './data/families.json';
import metaJson from './data/meta.json';
import minionsJson from './data/minions.json';
import movesJson from './data/moves.json';
import treesJson from './data/trees.json';
import typeChartJson from './data/typechart.json';

export interface FamilyData {
  id: string;
  name: string;
  members: string[];
}

export interface MinionData {
  id: string;
  dexId: number;
  dexNumber: number;
  name: string;
  sprite: string;
  sourceFunction: string;
  stage: number;
  types: string[];
  baseStats: Stats;
  maxStats: Stats;
  gems: { total: number; locked: number };
  evolvesAt: number | null;
  startingMoves: string[];
  specializationMoves: string[];
  treeIds: string[];
  familyId: string;
  familyName: string;
}

export interface TreeNodeData {
  col: number;
  row: number;
  moves: string[];
  requiresPreviousRow: boolean;
}

export interface TreeData {
  id: string;
  name: string;
  nodes: TreeNodeData[];
}

export type MoveKind = 'active' | 'passive' | 'global-passive';

export interface MoveEffect {
  kind: string;
  stat?: string;
  percent?: number;
  amount?: number;
  stages?: number;
  chance?: number;
  target?: string;
  scope?: string;
  passive?: boolean;
}

export interface MoveData {
  id: string;
  numericId: number;
  name: string;
  classId: string;
  classNumericId: number;
  tier: number;
  level: number;
  type: string | null;
  kind: MoveKind;
  /** Source art name, e.g. `moveIcon_flurry`; resolve with `moveIconPath`. */
  icon: string | null;
  energy: number;
  accuracy: number;
  cooldown: number;
  charge: number;
  exhaust: number;
  damage: number;
  randomDamage: number;
  dot: number;
  randomDot: number;
  healing: number;
  randomHealing: number;
  hot: number;
  randomHot: number;
  selfHeal: number;
  randomSelfHeal: number;
  selfDamage: number;
  randomSelfDamage: number;
  selfPercentageDamage: number;
  percentHealthRemoved: number;
  enemiesHit: number;
  alliesHit: number;
  randomTargets: boolean;
  onlySelf: boolean;
  hitsEachEnemy: boolean;
  visualBuffer: boolean;
  armor: number;
  shield: number;
  reflect: number;
  redirect: number;
  crit: number;
  stunChance: number;
  freezeChance: number;
  clearChance: number;
  reviveChance: number;
  energyRestore: number;
  overTimeTurns: number;
  buffStats: string[];
  debuffStats: string[];
  buffStages: number;
  debuffStages: number;
  buffChance: number;
  debuffChance: number;
  buffSelf: boolean;
  buffTargets: boolean;
  debuffSelf: boolean;
  debuffTargets: boolean;
  buffPercent: number;
  effects: MoveEffect[];
  /** Game-style description lines, generated from the fields by the importer. */
  description: string[];
  sourceFunction: string;
  obtainable: boolean;
}

export type MultiplierCode = 'weak' | 'resist' | 'neutral';

export interface TypeChartData {
  types: string[];
  matrix: Record<string, Record<string, MultiplierCode>>;
}

export interface PackMeta {
  source: {
    path: string;
    hash: string;
    attribution: string;
  };
  rules: {
    teamSize: number;
    maxLevel: number;
    skillPointsAtMax: number;
    treeColumns: number;
    treeRows: number;
    rowPointRequirement: number;
    secondaryTreeUnlockAt: number;
    stabModifier: number;
    weakModifier: number;
    resistModifier: number;
  };
  counts: {
    types: number;
    minions: number;
    families: number;
    trees: number;
    moves: number;
    declaredMoveSlots: number;
    unknownMoveIds: number[];
    ignoredTreeIds: string[];
    obtainableMoves: number;
  };
  warnings: string[];
}

export const FAMILIES = familiesJson as readonly FamilyData[];
export const MINIONS = minionsJson as readonly MinionData[];
export const TREES = treesJson as readonly TreeData[];
export const MOVES = movesJson as unknown as readonly MoveData[];
export const TYPE_CHART = typeChartJson as unknown as TypeChartData;
export const PACK_META = metaJson as unknown as PackMeta;

export const FAMILY_BY_ID: ReadonlyMap<string, FamilyData> = new Map(
  FAMILIES.map((family) => [family.id, family]),
);
export const MINION_BY_ID: ReadonlyMap<string, MinionData> = new Map(
  MINIONS.map((minion) => [minion.id, minion]),
);
export const TREE_BY_ID: ReadonlyMap<string, TreeData> = new Map(
  TREES.map((tree) => [tree.id, tree]),
);
export const MOVE_BY_ID: ReadonlyMap<string, MoveData> = new Map(
  MOVES.map((move) => [move.id, move]),
);
