import { describe, expect, it } from 'vitest';
import { MINIONS, MINION_BY_ID, MOVE_BY_ID } from '../src/packs/minhero/data';
import { createBuild, invest, purchasedMoveIds } from '../src/core/builds';
import {
  isDamagingMove,
  learnableMoveIds,
  matchup,
  slotAttackTypes,
  teamAttackTypes,
  teamDefense,
  teamOffense,
  uniqueTypeCombos,
  type Team,
} from '../src/core/coverage';

function buildWithOreDrill() {
  const base = createBuild('domisteam', 0, 'coverage-build', 'Coverage build');
  const result = invest(base, 0, 0, 0);
  if (!result.ok) throw new Error(result.error.message);
  return result.build;
}

describe('coverage engine', () => {
  it('uses all learnable damaging move types in learnable mode', () => {
    const types = slotAttackTypes({ minionId: 'domisteam', build: null }, 'learnable');
    expect(types).toEqual(expect.arrayContaining(['normal', 'fire', 'robot']));
    expect(learnableMoveIds('domisteam')).toContain('death_call_t5');
    expect(learnableMoveIds('domisteam')).toContain('fire_blast_t1');
  });

  it('uses only the selected build in build mode', () => {
    const build = buildWithOreDrill();
    const types = slotAttackTypes({ minionId: 'domisteam', build }, 'builds');
    expect(types).toEqual(['normal', 'robot']);
    expect(types).not.toContain('fire');
    expect(purchasedMoveIds(build)).toContain('death_call_t2');
  });

  it('classifies moves as damaging only when they deal damage', () => {
    expect(isDamagingMove(MOVE_BY_ID.get('death_call_t5')!)).toBe(true);
    expect(isDamagingMove(MOVE_BY_ID.get('ferocity_t5')!)).toBe(false);
    expect(isDamagingMove(MOVE_BY_ID.get('warmth_t1')!)).toBe(false);
  });

  it('evaluates offense against all 102 real minions', () => {
    const team: Team = [{ minionId: 'domisteam', build: null }];
    const coverage = teamOffense(team, 'learnable');
    expect(coverage.total).toBe(102);
    expect(coverage.defenders).toHaveLength(102);
    expect(coverage.defenders.every((entry) => MINION_BY_ID.has(entry.minionId))).toBe(true);
    expect(coverage.covered).toBeGreaterThan(0);
    expect(coverage.covered + coverage.neutral + coverage.resisted).toBe(102);
    expect(coverage.uncovered).toHaveLength(102 - coverage.covered);
    expect(coverage.byType).toHaveLength(14);
  });

  it('treats an empty team as covering nothing', () => {
    const coverage = teamOffense([], 'builds');
    expect(coverage.attackTypes).toEqual([]);
    expect(coverage.covered).toBe(0);
    expect(coverage.neutral).toBe(102);
    expect(teamAttackTypes([], 'builds')).toEqual([]);
  });

  it('summarizes defensive weaknesses and threats', () => {
    const team: Team = [
      { minionId: 'domisteam', build: null },
      { minionId: 'tortastone', build: null },
    ];
    const defense = teamDefense(team);
    expect(defense.members).toHaveLength(2);
    expect(defense.byType).toHaveLength(14);
    const domisteam = defense.members.find((member) => member.minionId === 'domisteam');
    expect(domisteam?.weakTo.some((cell) => cell.type === 'water')).toBe(true);
    expect(defense.byType.find((cell) => cell.type === 'water')?.weakCount).toBeGreaterThan(0);
    expect(defense.threats.length).toBeGreaterThan(0);
    for (const threat of defense.threats) {
      expect(threat.targets.length).toBeGreaterThan(0);
      expect(threat.targets.every((target) => target.slot === 0 || target.slot === 1)).toBe(true);
    }
  });

  it('builds a matchup matrix for a custom enemy team', () => {
    const team: Team = [{ minionId: 'domisteam', build: null }];
    const enemy: Team = [
      { minionId: 'falcona', build: null },
      { minionId: 'tortastone', build: null },
    ];
    const result = matchup(team, enemy, 'learnable');
    expect(result.cells).toHaveLength(2);
    expect(result.cells.every((cell) => cell.teamSlot === 0)).toBe(true);
    expect(result.favorable + result.unfavorable + result.even).toBe(2);
    expect(result.score).toBe(result.favorable - result.unfavorable);
    for (const cell of result.cells) {
      expect(cell.yourMultiplier.num).toBeGreaterThan(0);
      expect(cell.theirMultiplier.num).toBeGreaterThan(0);
    }
    expect(matchup(team, [], 'learnable').cells).toHaveLength(0);
  });

  it('lists only real in-game type combinations', () => {
    const combos = uniqueTypeCombos();
    expect(combos.length).toBeGreaterThan(1);
    expect(combos.length).toBeLessThanOrEqual(102);
    expect(new Set(combos.map((combo) => combo.key)).size).toBe(combos.length);
    expect(combos.reduce((total, combo) => total + combo.minions.length, 0)).toBe(102);
    const robot = combos.find((combo) => combo.types.length === 1 && combo.types[0] === 'robot');
    expect(robot?.minions).toContain('domisteam');
    expect(MINIONS).toHaveLength(102);
  });
});

