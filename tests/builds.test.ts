import { describe, expect, it } from 'vitest';
import {
  allocationKey,
  availablePoints,
  canInvest,
  chooseSpecialization,
  createBuild,
  invest,
  nodePoints,
  nodeStatuses,
  purchasedMoveIds,
  refund,
  resetBuild,
  totalSpent,
  treePointsSpent,
  validateBuild,
} from '../src/core/builds';
import type { BuildState } from '../src/core/types';

const DOMISTEAM = 'domisteam';

function investOk(build: BuildState, tree: number, col: number, row: number): BuildState {
  const result = invest(build, tree, col, row);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.build;
}

function deathCallBuild(): BuildState {
  return createBuild(DOMISTEAM, 0, 'test-build', 'Test build');
}

describe('build planner rules', () => {
  it('charges one point for the specialization start', () => {
    const build = deathCallBuild();
    expect(totalSpent(build)).toBe(1);
    expect(availablePoints(build)).toBe(16);
    expect(purchasedMoveIds(build)).toContain('death_call_t2');
  });

  it('spends one point per move and stops at node capacity', () => {
    let build = deathCallBuild();
    build = investOk(build, 0, 0, 0);
    build = investOk(build, 0, 0, 0);
    build = investOk(build, 0, 0, 0);
    expect(nodePoints(build, 0, 0, 0)).toBe(3);
    expect(canInvest(build, 0, 0, 0)?.code).toBe('node-full');
  });

  it('unlocks rows at 3/6/9 points in that tree', () => {
    let build = deathCallBuild();
    build = investOk(build, 0, 0, 0);
    build = investOk(build, 0, 0, 0);
    expect(canInvest(build, 0, 0, 1)?.code).toBe('row-locked');

    build = investOk(build, 0, 0, 0);
    expect(canInvest(build, 0, 0, 1)).toBeNull();
    expect(treePointsSpent(build, 0)).toBe(3);
  });

  it('requires a dependent node above to be fully learned', () => {
    let build = deathCallBuild();
    build = investOk(build, 0, 0, 0);
    build = investOk(build, 0, 0, 0);
    build = investOk(build, 0, 0, 0);
    expect(canInvest(build, 0, 1, 1)?.code).toBe('dependency-locked');

    build = investOk(build, 0, 1, 0);
    build = investOk(build, 0, 1, 0);
    expect(canInvest(build, 0, 1, 1)).toBeNull();
  });

  it('locks secondary trees until 10 points are spent in the primary tree', () => {
    let build = deathCallBuild();
    build = investOk(build, 0, 0, 0);
    build = investOk(build, 0, 0, 0);
    build = investOk(build, 0, 0, 0);
    build = investOk(build, 0, 1, 0);
    build = investOk(build, 0, 1, 0);
    build = investOk(build, 0, 2, 0);
    build = investOk(build, 0, 2, 0);
    build = investOk(build, 0, 2, 0);
    expect(canInvest(build, 1, 0, 0)?.code).toBe('secondary-locked');

    build = investOk(build, 0, 1, 1);
    build = investOk(build, 0, 1, 1);
    expect(treePointsSpent(build, 0)).toBe(10);
    expect(canInvest(build, 1, 0, 0)).toBeNull();
  });

  it('spends exactly 17 points and refuses more', () => {
    let build = deathCallBuild();
    build = investOk(build, 0, 0, 0);
    build = investOk(build, 0, 0, 0);
    build = investOk(build, 0, 0, 0);
    build = investOk(build, 0, 1, 0);
    build = investOk(build, 0, 1, 0);
    build = investOk(build, 0, 2, 0);
    build = investOk(build, 0, 2, 0);
    build = investOk(build, 0, 2, 0);
    build = investOk(build, 0, 0, 1);
    build = investOk(build, 0, 0, 1);
    build = investOk(build, 0, 0, 1);
    build = investOk(build, 0, 2, 1);
    build = investOk(build, 0, 0, 2);
    build = investOk(build, 0, 1, 2);
    build = investOk(build, 0, 1, 2);
    build = investOk(build, 0, 1, 3);

    expect(totalSpent(build)).toBe(17);
    expect(availablePoints(build)).toBe(0);
    expect(validateBuild(build).valid).toBe(true);
    expect(canInvest(build, 0, 1, 1)?.code).toBe('budget-exceeded');
    expect(purchasedMoveIds(build)).toContain('death_call_t5');
  });

  it('supports refunds and resets', () => {
    let build = deathCallBuild();
    build = investOk(build, 0, 0, 0);
    expect(totalSpent(build)).toBe(2);
    build = refund(build, 0, 0, 0);
    expect(totalSpent(build)).toBe(1);
    expect(build.allocations[allocationKey(0, 0, 0)]).toBeUndefined();

    const reset = resetBuild(build);
    expect(reset.primaryTree).toBe(-1);
    expect(Object.keys(reset.allocations)).toHaveLength(0);
  });

  it('clears allocations when the specialization changes', () => {
    let build = deathCallBuild();
    build = investOk(build, 0, 0, 0);
    const result = chooseSpecialization(build, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.build.primaryTree).toBe(1);
    expect(result.build.allocations).toEqual({});
    expect(purchasedMoveIds(result.build)).toContain('tire_t1');
  });

  it('flags invalid allocations', () => {
    const rowLocked = {
      ...deathCallBuild(),
      allocations: { [allocationKey(0, 0, 1)]: 1 },
    };
    expect(validateBuild(rowLocked).errors.some((error) => error.code === 'row-locked')).toBe(
      true,
    );

    const secondaryLocked = {
      ...deathCallBuild(),
      allocations: { [allocationKey(1, 0, 0)]: 1 },
    };
    expect(
      validateBuild(secondaryLocked).errors.some((error) => error.code === 'secondary-locked'),
    ).toBe(true);

    const invalidKey = {
      ...deathCallBuild(),
      allocations: { nope: 1 },
    };
    expect(
      validateBuild(invalidKey).errors.some((error) => error.code === 'invalid-allocation'),
    ).toBe(true);
  });

  it('returns node statuses for the whole 3x4 grid', () => {
    const build = deathCallBuild();
    const statuses = nodeStatuses(build);
    expect(statuses).toHaveLength(36);
    const secondaryStart = statuses.find(
      (status) => status.tree === 1 && status.col === 0 && status.row === 0,
    );
    expect(secondaryStart?.issue?.code).toBe('secondary-locked');
  });
});
