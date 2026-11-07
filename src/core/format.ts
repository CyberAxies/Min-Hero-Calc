import type { MoveData, MoveEffect } from '../packs/minhero/data';
import { formatMultiplier, type Rational } from './rational';
import { typeName, type EffectivenessRating } from './typechart';

const STAT_LABELS: Record<string, string> = {
  health: 'Health',
  energy: 'Energy',
  attack: 'Attack',
  healing: 'Healing',
  speed: 'Speed',
};

export function formatStat(stat: string): string {
  return STAT_LABELS[stat] ?? stat;
}

export function formatRating(rating: EffectivenessRating): string {
  switch (rating) {
    case 'double-weak':
      return 'Double weak';
    case 'weak':
      return 'Weak';
    case 'resist':
      return 'Resist';
    case 'double-resist':
      return 'Double resist';
    default:
      return 'Neutral';
  }
}

export function formatMultiplierValue(value: Rational): string {
  return formatMultiplier(value);
}

export function formatTargets(move: MoveData): string {
  const parts: string[] = [];
  if (move.onlySelf) parts.push('self');
  if (move.alliesHit > 0) {
    parts.push(move.alliesHit === 1 ? '1 ally' : `${move.alliesHit} allies`);
  }
  if (move.enemiesHit > 0) {
    parts.push(move.enemiesHit === 1 ? '1 enemy' : `${move.enemiesHit} enemies`);
  }
  if (move.randomTargets) parts.push('random');
  return parts.join(', ');
}

export function formatEffect(effect: MoveEffect): string {
  switch (effect.kind) {
    case 'buff':
    case 'debuff': {
      const stat = effect.stat ? formatStat(effect.stat) : 'stat';
      const amount =
        effect.percent !== undefined
          ? `${effect.percent}%`
          : effect.stages !== undefined
            ? `${Math.abs(effect.stages)} stage${Math.abs(effect.stages) === 1 ? '' : 's'}`
            : '';
      const direction = effect.kind === 'buff' ? '+' : '-';
      const target = effect.target === 'self' ? ' self' : effect.target === 'targets' ? ' target' : '';
      return `${stat} ${direction}${amount}${target}`.trim();
    }
    case 'stun':
      return `Stun ${effect.chance ?? 0}%`;
    case 'freeze':
      return `Freeze ${effect.chance ?? 0}%`;
    case 'clear':
      return `Clear buffs ${effect.chance ?? 0}%`;
    case 'revive':
      return `Revive ${effect.chance ?? 0}%`;
    case 'shield':
      return `Shield ${effect.amount ?? 0}`;
    case 'reflect':
      return `Reflect ${effect.amount ?? 0}`;
    case 'redirect':
      return `Redirect ${effect.percent ?? 0}%`;
    case 'armor':
      return `Armor ${effect.amount ?? 0}`;
    case 'crit':
      return `Crit +${effect.percent ?? 0}%`;
    case 'energy':
      return `Restore ${effect.percent ?? 0}% energy`;
    default:
      return effect.kind;
  }
}

/** A compact human-readable move line for the browser and planner preview. */
export function formatMoveSummary(move: MoveData): string {
  const parts: string[] = [];
  if (move.type) parts.push(typeName(move.type));
  if (move.damage > 0 || move.randomDamage > 0) {
    const max = move.damage + move.randomDamage;
    parts.push(move.randomDamage > 0 ? `${move.damage}-${max} damage` : `${move.damage} damage`);
  }
  if (move.dot > 0 || move.randomDot > 0) {
    parts.push(`${move.dot + move.randomDot} time damage`);
  }
  if (move.healing > 0 || move.randomHealing > 0) {
    parts.push(`${move.healing + move.randomHealing} healing`);
  }
  if (move.hot > 0) parts.push(`${move.hot} time healing`);
  if (move.energy > 0) parts.push(`${move.energy} energy`);
  if (move.cooldown > 0) parts.push(`${move.cooldown} cooldown`);
  if (move.accuracy < 100) parts.push(`${move.accuracy}% accuracy`);
  const targets = formatTargets(move);
  if (targets) parts.push(targets);
  for (const effect of move.effects) parts.push(formatEffect(effect));
  return parts.join(' · ');
}
