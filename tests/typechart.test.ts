import { describe, expect, it } from 'vitest';
import {
  ONE,
  equal,
  formatMultiplier,
  rational,
} from '../src/core/rational';
import {
  bestAttack,
  chartCode,
  defensiveProfile,
  effectiveness,
  isResisted,
  isSuperEffective,
  multiplierFor,
  rating,
  stabMultiplier,
} from '../src/core/typechart';

describe('exact type multipliers', () => {
  it('keeps weak + resist exactly neutral', () => {
    const value = effectiveness('fire', ['plant', 'water']);
    expect(equal(value, ONE)).toBe(true);
    expect(formatMultiplier(value)).toBe('×1');
    expect(rating(value)).toBe('neutral');
  });

  it('multiplies dual weaknesses and resistances', () => {
    const doublyWeak = effectiveness('fire', ['plant', 'ice']);
    expect(equal(doublyWeak, rational(9, 4))).toBe(true);
    expect(formatMultiplier(doublyWeak)).toBe('×2.25');
    expect(rating(doublyWeak)).toBe('double-weak');
    expect(isSuperEffective(doublyWeak)).toBe(true);

    const doublyResistant = effectiveness('water', ['water', 'plant']);
    expect(equal(doublyResistant, rational(4, 9))).toBe(true);
    expect(formatMultiplier(doublyResistant)).toBe('×0.44');
    expect(rating(doublyResistant)).toBe('double-resist');
    expect(isResisted(doublyResistant)).toBe(true);
  });

  it('reads the generated chart directly', () => {
    expect(chartCode('fire', 'plant')).toBe('weak');
    expect(multiplierFor('fire', 'plant')).toEqual(rational(3, 2));
    expect(chartCode('plant', 'fire')).toBe('resist');
    expect(chartCode('robot', 'robot')).toBe('neutral');
  });

  it('applies STAB only to matching types', () => {
    expect(stabMultiplier(['robot'], 'robot')).toEqual(rational(11, 10));
    expect(stabMultiplier(['robot'], 'fire')).toEqual(ONE);
  });

  it('selects the best attack type against a defender', () => {
    const best = bestAttack(['normal', 'fire', 'water'], ['plant', 'ice']);
    expect(best.type).toBe('fire');
    expect(equal(best.multiplier, rational(9, 4))).toBe(true);
  });

  it('provides a complete defensive profile', () => {
    const profile = defensiveProfile(['robot']);
    expect(profile).toHaveLength(14);
    expect(profile.find((cell) => cell.type === 'water')?.rating).toBe('weak');
    expect(profile.find((cell) => cell.type === 'plant')?.rating).toBe('resist');
  });
});
