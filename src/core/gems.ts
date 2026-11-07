/**
 * Gem maths, mirrored from the game's `SharedObjects/Gems/OwnedGem.as`.
 *
 * A gem rolls one stat between 60% and 140% quality. The displayed bonus is:
 *
 *   ceil((2 + T(T+1)/2) * quality / 100)     for tier T > 1
 *   ceil(3 * quality / 100)                  for tier 1
 *
 * Combined (multi-stat) gems are out of scope: the UI models one stat per gem,
 * which matches how gems are generated and is within a point of the game for
 * merged gems at the same tier.
 */

import type { MinionData } from '../packs/minhero/data';
import type { GemLoadout, GemSlot, GemStat, Stats } from './types';

export const GEM_STATS: readonly GemStat[] = ['health', 'energy', 'attack', 'healing', 'speed'];
export const GEM_TIER_MIN = 1;
export const GEM_TIER_MAX = 11;
export const GEM_QUALITY_MIN = 60;
export const GEM_QUALITY_MAX = 140;
export const GEM_QUALITY_DEFAULT = 100;
export const MAX_GEM_SLOTS = 3;

export const GEM_STAT_LABELS: Record<GemStat, string> = {
  health: 'Health',
  energy: 'Energy',
  attack: 'Attack',
  healing: 'Healing',
  speed: 'Speed',
};

/** Stat colours shared by gems, stat bars and labels. */
export const STAT_COLORS: Record<GemStat, string> = {
  health: '#e5484d',
  energy: '#a06bff',
  attack: '#ff8f3f',
  healing: '#e8c84a',
  speed: '#4f9dff',
};

export function clampTier(tier: number): number {
  if (!Number.isFinite(tier)) return GEM_TIER_MIN;
  return Math.min(GEM_TIER_MAX, Math.max(GEM_TIER_MIN, Math.round(tier)));
}

export function clampQuality(quality: number): number {
  if (!Number.isFinite(quality)) return GEM_QUALITY_DEFAULT;
  return Math.min(GEM_QUALITY_MAX, Math.max(GEM_QUALITY_MIN, Math.round(quality)));
}

/** Base stat points for a tier, before the quality roll. */
export function gemBaseValue(tier: number): number {
  const value = clampTier(tier);
  return value <= 1 ? 3 : 2 + (value * (value + 1)) / 2;
}

/** Displayed bonus of one gem. */
export function gemStatValue(gem: GemSlot): number {
  return Math.ceil((gemBaseValue(gem.tier) * clampQuality(gem.quality)) / 100);
}

export function emptyLoadout(slots = MAX_GEM_SLOTS): GemLoadout {
  return Array.from({ length: slots }, () => null);
}

/** Normalises untrusted data (saved state, share links) into a valid gem. */
export function sanitizeGem(value: unknown): GemSlot | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const stat = record['stat'];
  if (typeof stat !== 'string' || !(GEM_STATS as readonly string[]).includes(stat)) {
    return null;
  }
  const tier = Number(record['tier']);
  const quality = Number(record['quality']);
  if (!Number.isFinite(tier) || !Number.isFinite(quality)) return null;
  return { stat: stat as GemStat, tier: clampTier(tier), quality: clampQuality(quality) };
}

export function sanitizeLoadout(value: unknown, slots = MAX_GEM_SLOTS): GemLoadout {
  const loadout = emptyLoadout(slots);
  if (!Array.isArray(value)) return loadout;
  for (let index = 0; index < slots; index += 1) {
    loadout[index] = sanitizeGem(value[index]);
  }
  return loadout;
}

/** Sum of every equipped gem, per stat. */
export function loadoutBonus(loadout: GemLoadout | null | undefined): Stats {
  const bonus: Stats = { health: 0, energy: 0, attack: 0, healing: 0, speed: 0 };
  for (const gem of loadout ?? []) {
    if (gem) bonus[gem.stat] += gemStatValue(gem);
  }
  return bonus;
}

export function totalGemBonus(loadout: GemLoadout | null | undefined): number {
  const bonus = loadoutBonus(loadout);
  return bonus.health + bonus.energy + bonus.attack + bonus.healing + bonus.speed;
}

/** Max L60 stats plus the gem bonus. */
export function effectiveStats(minion: MinionData, loadout: GemLoadout | null | undefined): Stats {
  const bonus = loadoutBonus(loadout);
  return {
    health: minion.maxStats.health + bonus.health,
    energy: minion.maxStats.energy + bonus.energy,
    attack: minion.maxStats.attack + bonus.attack,
    healing: minion.maxStats.healing + bonus.healing,
    speed: minion.maxStats.speed + bonus.speed,
  };
}

/** Compact per-stat summary, e.g. `+17 attack · +8 speed`. */
export function loadoutSummary(loadout: GemLoadout | null | undefined): string {
  const bonus = loadoutBonus(loadout);
  return GEM_STATS.filter((stat) => bonus[stat] > 0)
    .map((stat) => `+${bonus[stat]} ${stat}`)
    .join(' · ');
}

/** Every socket the minion has (usable + locked), capped at the art's 3. */
export function gemSlotCount(minion: MinionData): number {
  return Math.min(MAX_GEM_SLOTS, minion.gems.total + minion.gems.locked);
}

/** Sockets the player can fill. Locked sockets are shown but disabled. */
export function unlockedGemSlots(minion: MinionData): number {
  return Math.min(MAX_GEM_SLOTS, minion.gems.total);
}
