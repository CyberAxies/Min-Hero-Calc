/** Exact rational arithmetic for type multipliers. */
export interface Rational {
  readonly num: number;
  readonly den: number;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

export function rational(num: number, den = 1): Rational {
  if (!Number.isInteger(num) || !Number.isInteger(den)) {
    throw new Error(`Rationals need integer components, got ${num}/${den}`);
  }
  if (den === 0) throw new Error('Division by zero in rational');
  const sign = den < 0 ? -1 : 1;
  const divisor = gcd(num, den);
  return {
    num: (num * sign) / divisor,
    den: Math.abs(den) / divisor,
  };
}

export const ONE = rational(1, 1);

export function multiply(a: Rational, b: Rational): Rational {
  return rational(a.num * b.num, a.den * b.den);
}

export function valueOf(value: Rational): number {
  return value.num / value.den;
}

export function compare(a: Rational, b: Rational): number {
  return a.num * b.den - b.num * a.den;
}

export function equal(a: Rational, b: Rational): boolean {
  return compare(a, b) === 0;
}

export function atLeast(a: Rational, b: Rational): boolean {
  return compare(a, b) >= 0;
}

export function atMost(a: Rational, b: Rational): boolean {
  return compare(a, b) <= 0;
}

/** Compact display used in the type chart and coverage panels. */
export function formatMultiplier(value: Rational): string {
  if (equal(value, ONE)) return '×1';
  if (equal(value, rational(3, 2))) return '×1.5';
  if (equal(value, rational(9, 4))) return '×2.25';
  if (equal(value, rational(2, 3))) return '×0.67';
  if (equal(value, rational(4, 9))) return '×0.44';
  return `×${valueOf(value).toFixed(2)}`;
}

export function formatFraction(value: Rational): string {
  return `${value.num}/${value.den}`;
}
