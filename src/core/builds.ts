import { MINION_BY_ID, MOVE_BY_ID, TREE_BY_ID } from '../packs/minhero/data';
import type { MinionData, MoveData, TreeNodeData } from '../packs/minhero/data';
import { MINHERO_RULES } from '../packs/minhero/rules';
import type { BuildState } from './types';

export const MAX_BUILD_POINTS = MINHERO_RULES.skillPointsAtMax;
export const ROW_POINT_REQUIREMENT = MINHERO_RULES.rowPointRequirement;
const SECONDARY_PRIMARY_POINTS = MINHERO_RULES.secondaryTreeUnlockAt - 1;

export type BuildIssueCode =
  | 'unknown-minion'
  | 'no-specialization'
  | 'invalid-tree'
  | 'invalid-node'
  | 'invalid-allocation'
  | 'row-locked'
  | 'dependency-locked'
  | 'secondary-locked'
  | 'budget-exceeded'
  | 'node-full'
  | 'node-empty'
  | 'unspent-points'
  | 'no-damaging-moves';

export interface BuildIssue {
  code: BuildIssueCode;
  message: string;
  tree?: number;
  col?: number;
  row?: number;
}

export interface BuildValidation {
  valid: boolean;
  errors: BuildIssue[];
  warnings: BuildIssue[];
  totalSpent: number;
  availablePoints: number;
}

export interface AllocationPosition {
  tree: number;
  col: number;
  row: number;
}

export type BuildMutation =
  | { ok: true; build: BuildState }
  | { ok: false; error: BuildIssue };

export function allocationKey(tree: number, col: number, row: number): string {
  return `${tree}:${col}:${row}`;
}

export function parseAllocationKey(key: string): AllocationPosition | null {
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  const [tree, col, row] = parts.map(Number);
  if (![tree, col, row].every((value) => Number.isInteger(value))) return null;
  if (tree === undefined || col === undefined || row === undefined) return null;
  if (tree < 0 || tree >= MINHERO_RULES.treeColumns) return null;
  if (col < 0 || col >= MINHERO_RULES.treeColumns) return null;
  if (row < 0 || row >= MINHERO_RULES.treeRows) return null;
  return { tree, col, row };
}

export function createBuild(
  minionId: string,
  primaryTree = -1,
  id = `build-${minionId}`,
  name = 'Untitled build',
): BuildState {
  return {
    id,
    name,
    minionId,
    primaryTree,
    allocations: {},
    updatedAt: Date.now(),
  };
}

export function getMinion(build: BuildState): MinionData | undefined {
  return MINION_BY_ID.get(build.minionId);
}

export function getTree(
  build: BuildState,
  treeIndex: number,
): { id: string; name: string; nodes: TreeNodeData[] } | undefined {
  const minion = getMinion(build);
  const treeId = minion?.treeIds[treeIndex];
  return treeId ? TREE_BY_ID.get(treeId) : undefined;
}

export function getNode(
  build: BuildState,
  tree: number,
  col: number,
  row: number,
): TreeNodeData | undefined {
  const treeData = getTree(build, tree);
  return treeData?.nodes[col * MINHERO_RULES.treeRows + row];
}

export function nodePoints(
  build: BuildState,
  tree: number,
  col: number,
  row: number,
): number {
  const value = build.allocations[allocationKey(tree, col, row)];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function treePointsSpent(build: BuildState, tree: number): number {
  let total = 0;
  for (const [key, points] of Object.entries(build.allocations)) {
    const position = parseAllocationKey(key);
    if (position && position.tree === tree && Number.isFinite(points)) total += points;
  }
  return total;
}

/** Includes the one-point specialization start move. */
export function totalSpent(build: BuildState): number {
  if (build.primaryTree < 0) return 0;
  return 1 + Object.values(build.allocations).reduce(
    (total, points) => total + (Number.isFinite(points) ? points : 0),
    0,
  );
}

export function availablePoints(build: BuildState): number {
  return MAX_BUILD_POINTS - totalSpent(build);
}

export function rowUnlocked(build: BuildState, tree: number, row: number): boolean {
  return row === 0 || treePointsSpent(build, tree) >= row * ROW_POINT_REQUIREMENT;
}

export function dependencySatisfied(
  build: BuildState,
  tree: number,
  col: number,
  row: number,
): boolean {
  const node = getNode(build, tree, col, row);
  if (!node || !node.requiresPreviousRow) return true;
  if (row === 0) return false;
  const previous = getNode(build, tree, col, row - 1);
  if (!previous || previous.moves.length === 0) return false;
  return nodePoints(build, tree, col, row - 1) >= previous.moves.length;
}

export function canInvest(
  build: BuildState,
  tree: number,
  col: number,
  row: number,
): BuildIssue | null {
  if (!getMinion(build)) {
    return { code: 'unknown-minion', message: `Unknown minion ${build.minionId}` };
  }
  if (build.primaryTree < 0) {
    return {
      code: 'no-specialization',
      message: 'Choose a specialization before spending points.',
    };
  }
  if (tree < 0 || tree >= MINHERO_RULES.treeColumns) {
    return { code: 'invalid-tree', message: `Invalid tree ${tree}`, tree };
  }
  const node = getNode(build, tree, col, row);
  if (!node || node.moves.length === 0) {
    return { code: 'invalid-node', message: 'That tree node is empty.', tree, col, row };
  }
  if (
    tree !== build.primaryTree &&
    treePointsSpent(build, build.primaryTree) < SECONDARY_PRIMARY_POINTS
  ) {
    return {
      code: 'secondary-locked',
      message: `Other trees unlock after ${SECONDARY_PRIMARY_POINTS} points in the main tree.`,
      tree,
      col,
      row,
    };
  }
  if (!rowUnlocked(build, tree, row)) {
    return {
      code: 'row-locked',
      message: `Row ${row + 1} needs ${row * ROW_POINT_REQUIREMENT} points in this tree.`,
      tree,
      col,
      row,
    };
  }
  if (!dependencySatisfied(build, tree, col, row)) {
    return {
      code: 'dependency-locked',
      message: 'The node above must be fully learned first.',
      tree,
      col,
      row,
    };
  }
  if (nodePoints(build, tree, col, row) >= node.moves.length) {
    return { code: 'node-full', message: 'That node is fully learned.', tree, col, row };
  }
  if (availablePoints(build) <= 0) {
    return { code: 'budget-exceeded', message: `No points left (max ${MAX_BUILD_POINTS}).` };
  }
  return null;
}

export function invest(
  build: BuildState,
  tree: number,
  col: number,
  row: number,
): BuildMutation {
  const error = canInvest(build, tree, col, row);
  if (error) return { ok: false, error };
  const key = allocationKey(tree, col, row);
  const nextPoints = nodePoints(build, tree, col, row) + 1;
  return {
    ok: true,
    build: {
      ...build,
      allocations: { ...build.allocations, [key]: nextPoints },
      updatedAt: Date.now(),
    },
  };
}

export function refund(build: BuildState, tree: number, col: number, row: number): BuildState {
  const points = nodePoints(build, tree, col, row);
  if (points <= 0) return build;
  const key = allocationKey(tree, col, row);
  const allocations = { ...build.allocations };
  if (points === 1) delete allocations[key];
  else allocations[key] = points - 1;
  return { ...build, allocations, updatedAt: Date.now() };
}

export function chooseSpecialization(build: BuildState, tree: number): BuildMutation {
  if (!getMinion(build)) {
    return {
      ok: false,
      error: { code: 'unknown-minion', message: `Unknown minion ${build.minionId}` },
    };
  }
  if (tree < 0 || tree >= MINHERO_RULES.treeColumns) {
    return { ok: false, error: { code: 'invalid-tree', message: `Invalid tree ${tree}`, tree } };
  }
  return {
    ok: true,
    build: { ...build, primaryTree: tree, allocations: {}, updatedAt: Date.now() },
  };
}

export function resetBuild(build: BuildState, keepSpecialization = false): BuildState {
  return {
    ...build,
    primaryTree: keepSpecialization ? build.primaryTree : -1,
    allocations: {},
    updatedAt: Date.now(),
  };
}

export function specializationMoveId(build: BuildState): string | undefined {
  const minion = getMinion(build);
  if (!minion || build.primaryTree < 0) return undefined;
  return minion.specializationMoves[build.primaryTree];
}

/** Starting moves + the chosen specialization + purchased node moves. */
export function purchasedMoveIds(build: BuildState): string[] {
  const minion = getMinion(build);
  if (!minion) return [];
  const ids = new Set<string>(minion.startingMoves);
  const specialization = specializationMoveId(build);
  if (specialization) ids.add(specialization);
  for (const [key, points] of Object.entries(build.allocations)) {
    const position = parseAllocationKey(key);
    if (!position || !Number.isInteger(points) || points <= 0) continue;
    const node = getNode(build, position.tree, position.col, position.row);
    if (!node) continue;
    for (const moveId of node.moves.slice(0, points)) ids.add(moveId);
  }
  return [...ids];
}

export function purchasedMoves(build: BuildState): MoveData[] {
  return purchasedMoveIds(build)
    .map((moveId) => MOVE_BY_ID.get(moveId))
    .filter((move): move is MoveData => move !== undefined);
}

export function validateBuild(build: BuildState): BuildValidation {
  const errors: BuildIssue[] = [];
  const warnings: BuildIssue[] = [];
  const minion = getMinion(build);
  if (!minion) {
    return {
      valid: false,
      errors: [{ code: 'unknown-minion', message: `Unknown minion ${build.minionId}` }],
      warnings,
      totalSpent: 0,
      availablePoints: MAX_BUILD_POINTS,
    };
  }

  if (build.primaryTree < 0) {
    if (Object.keys(build.allocations).length > 0) {
      errors.push({
        code: 'no-specialization',
        message: 'Allocations exist without a chosen specialization.',
      });
    } else {
      warnings.push({
        code: 'no-specialization',
        message: 'No specialization chosen yet.',
      });
    }
  } else if (build.primaryTree >= MINHERO_RULES.treeColumns) {
    errors.push({
      code: 'invalid-tree',
      message: `Invalid specialization ${build.primaryTree}.`,
      tree: build.primaryTree,
    });
  }

  for (const [key, points] of Object.entries(build.allocations)) {
    const position = parseAllocationKey(key);
    if (!position) {
      errors.push({ code: 'invalid-allocation', message: `Invalid allocation key ${key}.` });
      continue;
    }
    if (!Number.isInteger(points) || points <= 0) {
      errors.push({
        code: 'invalid-allocation',
        message: `Allocation ${key} must be a positive integer.`,
        ...position,
      });
      continue;
    }
    const node = getNode(build, position.tree, position.col, position.row);
    if (!node || node.moves.length === 0) {
      errors.push({
        code: 'invalid-node',
        message: `Allocation ${key} points at an empty node.`,
        ...position,
      });
      continue;
    }
    if (points > node.moves.length) {
      errors.push({
        code: 'invalid-allocation',
        message: `Allocation ${key} exceeds the node's ${node.moves.length} moves.`,
        ...position,
      });
    }
    if (
      position.tree !== build.primaryTree &&
      treePointsSpent(build, build.primaryTree) < SECONDARY_PRIMARY_POINTS
    ) {
      errors.push({
        code: 'secondary-locked',
        message: `Secondary trees require ${SECONDARY_PRIMARY_POINTS} points in the main tree first.`,
        ...position,
      });
    }
    if (!rowUnlocked(build, position.tree, position.row)) {
      errors.push({
        code: 'row-locked',
        message: `Row ${position.row + 1} is not unlocked in tree ${position.tree + 1}.`,
        ...position,
      });
    }
    if (!dependencySatisfied(build, position.tree, position.col, position.row)) {
      errors.push({
        code: 'dependency-locked',
        message: 'A prerequisite node above is not fully learned.',
        ...position,
      });
    }
  }

  if (totalSpent(build) > MAX_BUILD_POINTS) {
    errors.push({
      code: 'budget-exceeded',
      message: `Build spends ${totalSpent(build)} points; max is ${MAX_BUILD_POINTS}.`,
    });
  } else if (totalSpent(build) < MAX_BUILD_POINTS) {
    warnings.push({
      code: 'unspent-points',
      message: `${availablePoints(build)} points remain unspent.`,
    });
  }

  const hasDamagingMove = purchasedMoves(build).some(
    (move) =>
      move.kind === 'active' &&
      (move.damage > 0 ||
        move.randomDamage > 0 ||
        move.dot > 0 ||
        move.randomDot > 0 ||
        move.percentHealthRemoved > 0),
  );
  if (!hasDamagingMove) {
    warnings.push({
      code: 'no-damaging-moves',
      message: 'This build has no damaging move.',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    totalSpent: totalSpent(build),
    availablePoints: availablePoints(build),
  };
}

export interface BuildNodeStatus {
  tree: number;
  col: number;
  row: number;
  node: TreeNodeData;
  points: number;
  maxPoints: number;
  nextMove: MoveData | undefined;
  issue: BuildIssue | null;
}

/** Data for the planner grid; empty nodes are included but have no moves. */
export function nodeStatuses(build: BuildState): BuildNodeStatus[] {
  const out: BuildNodeStatus[] = [];
  for (let tree = 0; tree < MINHERO_RULES.treeColumns; tree += 1) {
    for (let col = 0; col < MINHERO_RULES.treeColumns; col += 1) {
      for (let row = 0; row < MINHERO_RULES.treeRows; row += 1) {
        const node = getNode(build, tree, col, row);
        if (!node) continue;
        const points = nodePoints(build, tree, col, row);
        const nextMoveId = node.moves[points];
        out.push({
          tree,
          col,
          row,
          node,
          points,
          maxPoints: node.moves.length,
          nextMove: nextMoveId ? MOVE_BY_ID.get(nextMoveId) : undefined,
          issue: node.moves.length > 0 ? canInvest(build, tree, col, row) : null,
        });
      }
    }
  }
  return out;
}
