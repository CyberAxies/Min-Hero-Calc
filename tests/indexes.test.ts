import { describe, expect, it } from 'vitest';
import { learnerCount, learnersForMove } from '../src/core/indexes';
import { MINIONS, MOVES } from '../src/packs/minhero/data';

describe('move learner index', () => {
  it('covers every obtainable move and nothing unreferenced', () => {
    const obtainable = MOVES.filter((move) => move.obtainable);
    expect(obtainable.length).toBe(785);
    for (const move of obtainable) {
      expect(learnerCount(move.id), move.id).toBeGreaterThan(0);
    }
    for (const move of MOVES.filter((entry) => !entry.obtainable)) {
      expect(learnerCount(move.id), move.id).toBe(0);
    }
  });

  it('lists each learner once and keeps dex order', () => {
    for (const move of MOVES) {
      const learners = learnersForMove(move.id);
      expect(new Set(learners.map((learner) => learner.minionId)).size).toBe(learners.length);
      const dex = learners.map(
        (learner) => MINIONS.find((minion) => minion.id === learner.minionId)?.dexId ?? -1,
      );
      expect(dex).toEqual([...dex].sort((a, b) => a - b));
    }
  });

  it('records why each minion can learn a move', () => {
    const claw = learnersForMove('claw_t1');
    expect(claw.length).toBeGreaterThan(0);
    for (const learner of claw) {
      expect(learner.sources.length).toBeGreaterThan(0);
      for (const source of learner.sources) {
        expect(['starting', 'specialization', 'tree']).toContain(source.kind);
        expect(source.label.length).toBeGreaterThan(0);
      }
    }
    const ticub = claw.find((learner) => learner.minionId === 'ticub');
    expect(ticub?.sources.some((source) => source.kind === 'starting')).toBe(true);
  });
});
