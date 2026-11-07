import { describe, expect, it } from 'vitest';
import {
  emptyLoadout,
  effectiveStats,
  gemBaseValue,
  gemSlotCount,
  gemStatValue,
  loadoutBonus,
  loadoutSummary,
  sanitizeLoadout,
  totalGemBonus,
  unlockedGemSlots,
} from '../src/core/gems';
import { MINION_BY_ID } from '../src/packs/minhero/data';

describe('gem maths', () => {
  it('matches the source base values per tier', () => {
    const tiers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    expect(tiers.map((tier) => gemBaseValue(tier))).toEqual([
      3, 5, 8, 12, 17, 23, 30, 38, 47, 57, 68,
    ]);
  });

  it('applies the quality roll and rounds up', () => {
    expect(gemStatValue({ stat: 'attack', tier: 5, quality: 100 })).toBe(17);
    expect(gemStatValue({ stat: 'attack', tier: 5, quality: 60 })).toBe(11);
    expect(gemStatValue({ stat: 'attack', tier: 5, quality: 140 })).toBe(24);
    expect(gemStatValue({ stat: 'attack', tier: 1, quality: 60 })).toBe(2);
  });

  it('clamps tier and quality to the legal range', () => {
    expect(gemStatValue({ stat: 'health', tier: 0, quality: 100 })).toBe(3);
    expect(gemStatValue({ stat: 'health', tier: 99, quality: 500 })).toBe(96);
    expect(gemStatValue({ stat: 'health', tier: 5, quality: -40 })).toBe(11);
  });

  it('sums a loadout and applies it on top of level 60', () => {
    const loadout = [
      { stat: 'attack' as const, tier: 5, quality: 100 },
      { stat: 'attack' as const, tier: 3, quality: 100 },
      null,
    ];
    expect(loadoutBonus(loadout)).toEqual({
      health: 0,
      energy: 0,
      attack: 25,
      healing: 0,
      speed: 0,
    });
    expect(totalGemBonus(loadout)).toBe(25);
    expect(loadoutSummary(loadout)).toBe('+25 attack');

    const tigertan = MINION_BY_ID.get('tigertan');
    expect(tigertan).toBeDefined();
    if (!tigertan) return;
    const stats = effectiveStats(tigertan, loadout);
    expect(stats.attack).toBe(tigertan.maxStats.attack + 25);
    expect(stats.health).toBe(tigertan.maxStats.health);
  });

  it('sanitises untrusted loadouts without throwing', () => {
    expect(sanitizeLoadout('nope')).toEqual([null, null, null]);
    expect(emptyLoadout()).toEqual([null, null, null]);
    expect(
      sanitizeLoadout([
        { stat: 'fire', tier: 5, quality: 100 },
        { stat: 'speed', tier: 999, quality: -10 },
        { stat: 'health', tier: 2, quality: 100 },
        'junk',
      ]),
    ).toEqual([
      null,
      { stat: 'speed', tier: 11, quality: 60 },
      { stat: 'health', tier: 2, quality: 100 },
    ]);
  });

  it('counts usable and locked sockets from the pack', () => {
    const ticub = MINION_BY_ID.get('ticub');
    const seiryu = MINION_BY_ID.get('seiryu');
    expect(ticub).toBeDefined();
    expect(seiryu).toBeDefined();
    if (!ticub || !seiryu) return;
    expect(gemSlotCount(ticub)).toBe(2);
    expect(unlockedGemSlots(ticub)).toBe(1);
    expect(gemSlotCount(seiryu)).toBe(3);
    expect(unlockedGemSlots(seiryu)).toBe(3);
  });
});
