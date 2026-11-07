import { describe, expect, it } from 'vitest';
import {
  FAMILIES,
  FAMILY_BY_ID,
  MINIONS,
  MINION_BY_ID,
  MOVES,
  MOVE_BY_ID,
  PACK_META,
  TREES,
  TREE_BY_ID,
  TYPE_CHART,
} from '../src/packs/minhero/data';
import { MINHERO_RULES, TYPES } from '../src/packs/minhero/rules';

const TYPE_IDS = new Set(TYPES.map((type) => type.id));
const MOVE_IDS = new Set(MOVES.map((move) => move.id));

function matrixCell(attacker: string, defender: string): string | undefined {
  return TYPE_CHART.matrix[attacker]?.[defender];
}

describe('generated Min Hero data', () => {
  it('has the expected top-level counts', () => {
    expect(TYPES).toHaveLength(14);
    expect(MINIONS).toHaveLength(102);
    expect(FAMILIES).toHaveLength(54);
    expect(TREES).toHaveLength(159);
    expect(MOVES).toHaveLength(888);
    expect(PACK_META.counts.declaredMoveSlots).toBe(893);
    expect(PACK_META.counts.unknownMoveIds).toEqual([135, 136, 137, 138, 139]);
    expect(PACK_META.counts.ignoredTreeIds).toEqual(['IceTree_Rock', 'GetTestTalentTree']);
  });

  it('has unique minion, family, tree and move identifiers', () => {
    expect(new Set(MINIONS.map((minion) => minion.id)).size).toBe(MINIONS.length);
    expect(new Set(MINIONS.map((minion) => minion.dexId)).size).toBe(MINIONS.length);
    expect(new Set(FAMILIES.map((family) => family.id)).size).toBe(FAMILIES.length);
    expect(new Set(TREES.map((tree) => tree.id)).size).toBe(TREES.length);
    expect(new Set(MOVES.map((move) => move.id)).size).toBe(MOVES.length);
    expect(new Set(MOVES.map((move) => move.numericId)).size).toBe(MOVES.length);
  });

  it('keeps every minion, move and tree reference resolvable', () => {
    for (const minion of MINIONS) {
      expect(minion.dexNumber).toBe(minion.dexId + 1);
      expect(minion.types.length).toBeGreaterThanOrEqual(1);
      expect(minion.types.length).toBeLessThanOrEqual(2);
      for (const typeId of minion.types) expect(TYPE_IDS.has(typeId)).toBe(true);
      expect(minion.treeIds).toHaveLength(3);
      expect(new Set(minion.treeIds).size).toBe(3);
      for (const treeId of minion.treeIds) expect(TREE_BY_ID.has(treeId)).toBe(true);
      expect(FAMILY_BY_ID.has(minion.familyId)).toBe(true);
      expect(FAMILY_BY_ID.get(minion.familyId)?.members).toContain(minion.id);
      expect(minion.specializationMoves).toHaveLength(3);
      for (const moveId of [...minion.startingMoves, ...minion.specializationMoves]) {
        expect(MOVE_IDS.has(moveId)).toBe(true);
      }
      for (const stat of Object.values(minion.maxStats)) expect(stat).toBeGreaterThan(0);
    }
  });

  it('assigns every minion to exactly one family', () => {
    const familyMembers = FAMILIES.flatMap((family) => family.members);
    expect(familyMembers).toHaveLength(MINIONS.length);
    expect(new Set(familyMembers).size).toBe(MINIONS.length);
    for (const memberId of familyMembers) expect(MINION_BY_ID.has(memberId)).toBe(true);
  });

  it('keeps every tree a 3x4 grid with resolvable, ordered node moves', () => {
    for (const tree of TREES) {
      expect(tree.nodes).toHaveLength(12);
      const seenMoves = new Set<string>();
      for (const [index, node] of tree.nodes.entries()) {
        expect(node.col).toBe(Math.floor(index / 4));
        expect(node.row).toBe(index % 4);
        let previousTier = -1;
        const classes = new Set<string>();
        for (const moveId of node.moves) {
          const move = MOVE_BY_ID.get(moveId);
          expect(move).toBeDefined();
          if (!move) continue;
          expect(TYPE_IDS.has(move.type ?? '') || move.type === null).toBe(true);
          expect(move.tier).toBeGreaterThanOrEqual(previousTier);
          previousTier = move.tier;
          classes.add(move.classId);
          expect(seenMoves.has(moveId)).toBe(false);
          seenMoves.add(moveId);
        }
        expect(classes.size).toBeLessThanOrEqual(1);
        if (node.requiresPreviousRow) {
          expect(node.row).toBeGreaterThan(0);
          const previous = tree.nodes[node.col * 4 + (node.row - 1)];
          expect(previous?.moves.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps move classes and tiers internally consistent', () => {
    const tiersByClass = new Map<string, Set<number>>();
    for (const move of MOVES) {
      expect(move.level).toBe(move.tier + 1);
      expect(move.tier).toBeGreaterThanOrEqual(0);
      expect(move.tier).toBeLessThanOrEqual(4);
      expect(move.kind).toMatch(/^(active|passive|global-passive)$/);
      expect(move.type === null || TYPE_IDS.has(move.type)).toBe(true);
      const tiers = tiersByClass.get(move.classId) ?? new Set<number>();
      expect(tiers.has(move.tier)).toBe(false);
      tiers.add(move.tier);
      tiersByClass.set(move.classId, tiers);
    }
    expect([...tiersByClass.keys()].length).toBeGreaterThan(100);
  });

  it('preserves known max-level stats from the source', () => {
    const expected = {
      ticub: { health: 245, energy: 210, attack: 125, healing: 110, speed: 155 },
      tigertan: { health: 365, energy: 300, attack: 185, healing: 140, speed: 215 },
      domisteam: { health: 305, energy: 165, attack: 245, healing: 110, speed: 230 },
      seiryu: { health: 515, energy: 322, attack: 260, healing: 245, speed: 230 },
    } as const;
    for (const [minionId, stats] of Object.entries(expected)) {
      expect(MINION_BY_ID.get(minionId)?.maxStats).toEqual(stats);
    }
  });

  it('preserves known move values from the source', () => {
    const pound = MOVE_BY_ID.get('pound_t1');
    expect(pound?.damage).toBe(20);
    expect(pound?.energy).toBe(3);
    expect(pound?.type).toBe('normal');
    expect(pound?.icon).toBe('moveIcon_pound');

    const deathCall = MOVE_BY_ID.get('death_call_t5');
    expect(deathCall?.name).toBe('Death Call 2');
    expect(deathCall?.damage).toBe(125);
    expect(deathCall?.energy).toBe(160);
    expect(deathCall?.cooldown).toBe(3);
    expect(deathCall?.type).toBe('robot');

    const ferocity = MOVE_BY_ID.get('ferocity_t5');
    expect(ferocity?.kind).toBe('passive');
    expect(ferocity?.buffPercent).toBe(50);
    expect(ferocity?.effects).toContainEqual({
      kind: 'buff',
      stat: 'attack',
      percent: 50,
      scope: 'self',
      passive: true,
    });
  });

  it('marks only referenced moves obtainable', () => {
    expect(MOVES.filter((move) => move.obtainable)).toHaveLength(
      PACK_META.counts.obtainableMoves,
    );
    for (const unknownId of PACK_META.counts.unknownMoveIds) {
      expect(MOVES.some((move) => move.numericId === unknownId)).toBe(false);
    }
  });

  it('carries the source move icon name for every move', () => {
    for (const move of MOVES) {
      expect(move.icon, move.id).toMatch(/^moveIcon_[A-Za-z0-9]+$/);
    }
    // Level copies inherit the icon of the move they were copied from.
    expect(MOVE_BY_ID.get('pound_t1')?.icon).toBe('moveIcon_pound');
    expect(MOVE_BY_ID.get('pound_t2')?.icon).toBe('moveIcon_pound');
    expect(MOVE_BY_ID.get('death_call_t5')?.icon).toBe('moveIcon_deathCall');
  });

  it('ships a game-style description for every move', () => {
    for (const move of MOVES) {
      expect(move.description.length, move.id).toBeGreaterThan(0);
    }
    expect(MOVE_BY_ID.get('pound_t1')?.description).toEqual(['Damage: 20', 'Energy: 3']);
    expect(MOVE_BY_ID.get('burn_t1')?.description).toContain('Time Damage: 15 over 3 turns');
    expect(MOVE_BY_ID.get('flurry_t1')?.description).toContain('Enemies Hit: 2 random');
    expect(MOVE_BY_ID.get('fortitude_t1')?.description).toEqual(['Increases health by 10%']);
    expect(MOVE_BY_ID.get('taunt_t1')?.description).toEqual([
      'Redirects 30% of damage to this minion',
    ]);
  });
});

describe('generated type chart', () => {
  it('is a complete 14x14 matrix of valid codes', () => {
    expect(TYPE_CHART.types).toEqual(TYPES.map((type) => type.id));
    expect(TYPE_CHART.types).toHaveLength(14);
    for (const attacker of TYPE_CHART.types) {
      expect(Object.keys(TYPE_CHART.matrix[attacker] ?? {})).toHaveLength(14);
      for (const defender of TYPE_CHART.types) {
        expect(['weak', 'resist', 'neutral']).toContain(matrixCell(attacker, defender));
      }
    }
  });

  it('matches known source cells', () => {
    expect(matrixCell('fire', 'plant')).toBe('weak');
    expect(matrixCell('plant', 'fire')).toBe('resist');
    expect(matrixCell('water', 'fire')).toBe('weak');
    expect(matrixCell('fire', 'water')).toBe('resist');
    expect(matrixCell('earth', 'flying')).toBe('weak');
    expect(matrixCell('titan', 'titan')).toBe('weak');
    expect(matrixCell('robot', 'robot')).toBe('neutral');
  });
});

describe('pack metadata', () => {
  it('matches the runtime rules and generated counts', () => {
    expect(PACK_META.rules.teamSize).toBe(MINHERO_RULES.teamSize);
    expect(PACK_META.rules.maxLevel).toBe(MINHERO_RULES.maxLevel);
    expect(PACK_META.rules.skillPointsAtMax).toBe(MINHERO_RULES.skillPointsAtMax);
    expect(PACK_META.rules.treeColumns).toBe(MINHERO_RULES.treeColumns);
    expect(PACK_META.counts.minions).toBe(MINIONS.length);
    expect(PACK_META.counts.families).toBe(FAMILIES.length);
    expect(PACK_META.counts.trees).toBe(TREES.length);
    expect(PACK_META.counts.moves).toBe(MOVES.length);
  });
});
