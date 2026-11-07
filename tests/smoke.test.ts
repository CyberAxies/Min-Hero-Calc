import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../src/core/store';
import { MINHERO_RULES, TYPES } from '../src/packs/minhero/rules';

describe('Min Hero pack skeleton', () => {
  it('exposes the 14 in-game types', () => {
    expect(TYPES).toHaveLength(14);
    expect(new Set(TYPES.map((type) => type.id)).size).toBe(14);
  });

  it('exposes the core rules verified from the decompiled source', () => {
    expect(MINHERO_RULES.teamSize).toBe(5);
    expect(MINHERO_RULES.maxLevel).toBe(60);
    expect(MINHERO_RULES.skillPointsAtMax).toBe(17);
    expect(MINHERO_RULES.treeColumns).toBe(3);
    expect(MINHERO_RULES.treeRows).toBe(4);
    expect(MINHERO_RULES.rowPointRequirement).toBe(3);
    expect(MINHERO_RULES.secondaryTreeUnlockAt).toBe(11);
  });
});

describe('store defaults', () => {
  it('creates five empty team and enemy slots', () => {
    const state = createDefaultState();
    expect(state.team).toHaveLength(5);
    expect(state.enemy).toHaveLength(5);
    expect(state.team.every((slot) => slot === null)).toBe(true);
    expect(state.settings.coverageMode).toBe('builds');
  });
});
