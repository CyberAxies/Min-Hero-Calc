import { TYPE_CHART } from '../packs/minhero/data';
import { MINHERO_RULES, TYPE_BY_ID } from '../packs/minhero/rules';
import {
  ONE,
  atLeast,
  atMost,
  compare,
  equal,
  multiply,
  rational,
  type Rational,
} from './rational';

export type MultiplierCode = 'weak' | 'resist' | 'neutral';
export type EffectivenessRating =
  | 'double-weak'
  | 'weak'
  | 'neutral'
  | 'resist'
  | 'double-resist';

export const WEAK_MULTIPLIER = rational(
  MINHERO_RULES.weak.num,
  MINHERO_RULES.weak.den,
);
export const RESIST_MULTIPLIER = rational(
  MINHERO_RULES.resist.num,
  MINHERO_RULES.resist.den,
);
export const STAB_MULTIPLIER = rational(
  MINHERO_RULES.stab.num,
  MINHERO_RULES.stab.den,
);

const DOUBLE_WEAK = multiply(WEAK_MULTIPLIER, WEAK_MULTIPLIER);
const DOUBLE_RESIST = multiply(RESIST_MULTIPLIER, RESIST_MULTIPLIER);

const CODE_MULTIPLIERS: Record<MultiplierCode, Rational> = {
  weak: WEAK_MULTIPLIER,
  resist: RESIST_MULTIPLIER,
  neutral: ONE,
};

export function chartCode(attacker: string, defender: string): MultiplierCode {
  const code = TYPE_CHART.matrix[attacker]?.[defender];
  if (!code) {
    throw new Error(`Missing type chart cell ${attacker} -> ${defender}`);
  }
  return code;
}

/** One attacker type against one defender type. */
export function multiplierFor(attacker: string, defender: string): Rational {
  return CODE_MULTIPLIERS[chartCode(attacker, defender)];
}

/** One attacker type against a mono- or dual-type defender. */
export function effectiveness(
  attacker: string,
  defenderTypes: readonly string[],
): Rational {
  let total = ONE;
  for (const defender of defenderTypes) {
    total = multiply(total, multiplierFor(attacker, defender));
  }
  return total;
}

export function stabMultiplier(
  attackerTypes: readonly string[],
  moveType: string,
): Rational {
  return attackerTypes.includes(moveType) ? STAB_MULTIPLIER : ONE;
}

export function rating(value: Rational): EffectivenessRating {
  if (equal(value, DOUBLE_WEAK)) return 'double-weak';
  if (equal(value, WEAK_MULTIPLIER)) return 'weak';
  if (equal(value, RESIST_MULTIPLIER)) return 'resist';
  if (equal(value, DOUBLE_RESIST)) return 'double-resist';
  return 'neutral';
}

export function isSuperEffective(value: Rational): boolean {
  return atLeast(value, WEAK_MULTIPLIER);
}

export function isResisted(value: Rational): boolean {
  return atMost(value, RESIST_MULTIPLIER);
}

export interface BestAttack {
  type: string | null;
  multiplier: Rational;
}

/** The best attack type from a set against a defender's type combination. */
export function bestAttack(
  attackerTypes: readonly string[],
  defenderTypes: readonly string[],
): BestAttack {
  let best: BestAttack = { type: null, multiplier: ONE };
  for (const attacker of new Set(attackerTypes)) {
    const value = effectiveness(attacker, defenderTypes);
    if (best.type === null || compare(value, best.multiplier) > 0) {
      best = { type: attacker, multiplier: value };
    }
  }
  return best;
}

export interface DefensiveCell {
  type: string;
  multiplier: Rational;
  rating: EffectivenessRating;
}

/** Every attacking type against a defender type combination. */
export function defensiveProfile(defenderTypes: readonly string[]): DefensiveCell[] {
  return TYPE_CHART.types.map((attacker) => {
    const value = effectiveness(attacker, defenderTypes);
    return { type: attacker, multiplier: value, rating: rating(value) };
  });
}

export function typeName(typeId: string): string {
  return TYPE_BY_ID.get(typeId)?.name ?? typeId;
}
