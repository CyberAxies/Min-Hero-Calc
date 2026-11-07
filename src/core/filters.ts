/**
 * Filter and sort engine shared by the minion and move browsers.
 *
 * Queries are deliberately Showdown-ish and typed into one search box:
 *   type:fire            include a type (OR with other includes)
 *   !type:water          exclude a type
 *   attack>=200          numeric comparison (>, >=, <, <=, =)
 *   stage:2              flag equality (kind:passive, class:flurry…)
 *   learns:flurry        minion learns a move (substring of id or name)
 *   anything else        free text, every term must match
 *
 * The chip row and advanced panel write into the same `FilterState`, so the
 * engine only ever sees one merged query.
 */

import { TYPES } from '../packs/minhero/rules';

export type ComparisonOp = '>' | '>=' | '<' | '<=' | '=';

export interface NumericPredicate {
  field: string;
  op: ComparisonOp;
  value: number;
}

export interface ParsedQuery {
  terms: string[];
  includeTypes: string[];
  excludeTypes: string[];
  numbers: NumericPredicate[];
  /** Flag name → accepted values (OR within a flag). */
  flags: Record<string, string[]>;
  learns: string[];
}

/** Persisted, UI-shaped filter state. */
export interface FilterState {
  query: string;
  types: string[];
  excludedTypes: string[];
  /** field → minimum value (blank means unset). */
  numbers: Record<string, string>;
  /** field → required value (blank means unset). */
  flags: Record<string, string>;
  /** Substring matched against a minion's learnable move ids/names. */
  learns: string;
  sort: string;
}

/** Everything the matcher needs to know about one row. */
export interface FilterTarget {
  /** Lower-case haystack for free-text terms. */
  text: string;
  types: readonly string[];
  numbers: Readonly<Record<string, number>>;
  flags?: Readonly<Record<string, string>>;
  /** Lower-case haystack of learnable move ids and names. */
  learns?: string;
}

const TYPE_IDS = new Set(TYPES.map((type) => type.id));
const TYPE_BY_NAME = new Map(TYPES.map((type) => [type.name.toLowerCase(), type.id]));

const COMPARISON = /^([a-z]+)(>=|<=|>|<|=)(-?\d+(?:\.\d+)?)$/;
const FLAG = /^([a-z]+):([a-z0-9_*'-]+)$/i;

export function emptyFilterState(sort = ''): FilterState {
  return { query: '', types: [], excludedTypes: [], numbers: {}, flags: {}, learns: '', sort };
}

/** Accepts a type id or its display name; returns the canonical id. */
export function normalizeTypeToken(value: string): string | null {
  const token = value.trim().toLowerCase();
  if (!token) return null;
  if (TYPE_IDS.has(token)) return token;
  return TYPE_BY_NAME.get(token) ?? null;
}

export function parseSearch(input: string): ParsedQuery {
  const parsed: ParsedQuery = {
    terms: [],
    includeTypes: [],
    excludeTypes: [],
    numbers: [],
    flags: {},
    learns: [],
  };

  for (const token of input.toLowerCase().split(/\s+/)) {
    if (!token) continue;

    if (token.startsWith('!type:')) {
      const typeId = normalizeTypeToken(token.slice(6));
      if (typeId) parsed.excludeTypes.push(typeId);
      else parsed.terms.push(token);
      continue;
    }
    if (token.startsWith('type:')) {
      const typeId = normalizeTypeToken(token.slice(5));
      if (typeId) parsed.includeTypes.push(typeId);
      else parsed.terms.push(token);
      continue;
    }
    if (token.startsWith('learns:')) {
      const value = token.slice(7);
      if (value) parsed.learns.push(value);
      continue;
    }

    const comparison = COMPARISON.exec(token);
    if (comparison) {
      const [, field = '', op = '', value = ''] = comparison;
      parsed.numbers.push({ field, op: op as ComparisonOp, value: Number(value) });
      continue;
    }

    const flag = FLAG.exec(token);
    if (flag) {
      const [, field = '', value = ''] = flag;
      (parsed.flags[field] ??= []).push(value);
      continue;
    }

    parsed.terms.push(token);
  }

  return parsed;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** Merges the typed query with the chip/advanced controls into one query. */
export function mergeFilter(state: FilterState): ParsedQuery {
  const parsed = parseSearch(state.query);

  parsed.includeTypes.push(...state.types);
  parsed.excludeTypes.push(...state.excludedTypes);
  parsed.includeTypes = unique(parsed.includeTypes);
  parsed.excludeTypes = unique(parsed.excludeTypes);

  for (const [field, raw] of Object.entries(state.numbers)) {
    const value = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(value)) {
      parsed.numbers.push({ field, op: '>=', value });
    }
  }

  for (const [field, value] of Object.entries(state.flags)) {
    if (value) (parsed.flags[field] ??= []).push(value);
  }

  const learns = state.learns.trim().toLowerCase();
  if (learns) parsed.learns.push(learns);

  return parsed;
}

function compare(value: number, op: ComparisonOp, target: number): boolean {
  switch (op) {
    case '>':
      return value > target;
    case '>=':
      return value >= target;
    case '<':
      return value < target;
    case '<=':
      return value <= target;
    case '=':
      return value === target;
  }
}

export function matchesTarget(target: FilterTarget, query: ParsedQuery): boolean {
  for (const term of query.terms) {
    if (!target.text.includes(term)) return false;
  }

  if (query.includeTypes.length > 0) {
    const wanted = new Set(query.includeTypes);
    if (!target.types.some((type) => wanted.has(type))) return false;
  }
  if (query.excludeTypes.length > 0) {
    const banned = new Set(query.excludeTypes);
    if (target.types.some((type) => banned.has(type))) return false;
  }

  for (const predicate of query.numbers) {
    const value = target.numbers[predicate.field];
    if (value === undefined || !compare(value, predicate.op, predicate.value)) return false;
  }

  for (const [field, accepted] of Object.entries(query.flags)) {
    const actual = target.flags?.[field];
    if (!actual || !accepted.includes(actual)) return false;
  }

  for (const learn of query.learns) {
    if (!target.learns?.includes(learn)) return false;
  }

  return true;
}

/** Number of active controls, used for the "reset" affordance. */
export function countActiveFilters(state: FilterState): number {
  let active = 0;
  if (state.query.trim() !== '') active += 1;
  active += state.types.length + state.excludedTypes.length;
  active += Object.values(state.numbers).filter((value) => value.trim() !== '').length;
  active += Object.values(state.flags).filter((value) => value !== '').length;
  if (state.learns.trim() !== '') active += 1;
  return active;
}
