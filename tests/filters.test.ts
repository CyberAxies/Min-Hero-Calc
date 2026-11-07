import { describe, expect, it } from 'vitest';
import {
  countActiveFilters,
  emptyFilterState,
  matchesTarget,
  mergeFilter,
  normalizeTypeToken,
  parseSearch,
} from '../src/core/filters';
import type { FilterTarget } from '../src/core/filters';

const tigertan: FilterTarget = {
  text: 'tigertan tigertan normal 002',
  types: ['normal'],
  numbers: { health: 365, energy: 300, attack: 185, healing: 140, speed: 215, gems: 2, stage: 2 },
  flags: { stage: '2', kind: 'active' },
  learns: 'claw_t1 claw roar_t1 roar reckless_dash_t1 reckless dash chosen_earth_t2 chosen earth',
};

const keres: FilterTarget = {
  text: 'cerberus cerberus demonic fire 001',
  types: ['demonic', 'fire'],
  numbers: { health: 305, energy: 165, attack: 425, healing: 110, speed: 260, gems: 3, stage: 1 },
  flags: { stage: '1', kind: 'passive' },
  learns: 'sear_t2 sear fire_blast_t1 fire blast',
};

function matches(target: FilterTarget, input: string): boolean {
  return matchesTarget(target, parseSearch(input));
}

describe('filter query parsing', () => {
  it('reads type includes and exclusions by id or name', () => {
    const query = parseSearch('type:Fire !type:water');
    expect(query.includeTypes).toEqual(['fire']);
    expect(query.excludeTypes).toEqual(['water']);
    expect(normalizeTypeToken('Electric')).toBe('electric');
    expect(normalizeTypeToken('nope')).toBeNull();
  });

  it('reads numeric comparisons', () => {
    expect(parseSearch('attack>=200').numbers).toEqual([
      { field: 'attack', op: '>=', value: 200 },
    ]);
    expect(parseSearch('speed<300').numbers).toEqual([{ field: 'speed', op: '<', value: 300 }]);
    expect(parseSearch('gems=3').numbers).toEqual([{ field: 'gems', op: '=', value: 3 }]);
  });

  it('reads flag, learn and free-text tokens', () => {
    const query = parseSearch('kind:passive learns:flurry Heavy Hitter');
    expect(query.flags.kind).toEqual(['passive']);
    expect(query.learns).toEqual(['flurry']);
    expect(query.terms).toEqual(['heavy', 'hitter']);
  });

  it('treats unknown type names as plain text', () => {
    const query = parseSearch('type:banana');
    expect(query.includeTypes).toEqual([]);
    expect(query.terms).toEqual(['type:banana']);
  });

  it('merges chip and advanced controls into the typed query', () => {
    const state = emptyFilterState('dex');
    state.query = 'fire';
    state.types = ['water', 'fire'];
    state.excludedTypes = ['plant'];
    state.numbers.attack = '200';
    state.numbers.health = '';
    state.flags.kind = 'passive';
    state.learns = 'Flurry';
    const merged = mergeFilter(state);
    expect(merged.includeTypes.sort()).toEqual(['fire', 'water']);
    expect(merged.excludeTypes).toEqual(['plant']);
    expect(merged.numbers).toContainEqual({ field: 'attack', op: '>=', value: 200 });
    expect(merged.flags.kind).toEqual(['passive']);
    expect(merged.learns).toEqual(['flurry']);
    expect(merged.terms).toEqual(['fire']);
  });
});

describe('filter matching', () => {
  it('requires every free-text term', () => {
    expect(matches(tigertan, 'tiger')).toBe(true);
    expect(matches(tigertan, 'tiger normal')).toBe(true);
    expect(matches(tigertan, 'tiger fire')).toBe(false);
  });

  it('ORs included types and rejects excluded ones', () => {
    expect(matches(keres, 'type:fire')).toBe(true);
    expect(matches(keres, 'type:water type:fire')).toBe(true);
    expect(matches(keres, 'type:water')).toBe(false);
    expect(matches(keres, '!type:fire')).toBe(false);
    expect(matches(tigertan, '!type:fire type:normal')).toBe(true);
  });

  it('applies every numeric predicate', () => {
    expect(matches(tigertan, 'attack>=150 health<400')).toBe(true);
    expect(matches(tigertan, 'attack>=200')).toBe(false);
    expect(matches(keres, 'gems=3')).toBe(true);
    expect(matches(keres, 'gems>=2 speed>250')).toBe(true);
  });

  it('matches flags and learnable moves', () => {
    expect(matches(keres, 'kind:passive')).toBe(true);
    expect(matches(tigertan, 'kind:passive')).toBe(false);
    expect(matches(tigertan, 'stage:2')).toBe(true);
    expect(matches(tigertan, 'learns:reckless')).toBe(true);
    expect(matches(keres, 'learns:reckless')).toBe(false);
  });

  it('counts active controls', () => {
    const state = emptyFilterState('');
    expect(countActiveFilters(state)).toBe(0);
    state.query = 'fire';
    state.types = ['water'];
    state.excludedTypes = ['plant'];
    state.numbers.attack = '100';
    state.flags.kind = 'passive';
    state.learns = 'claw';
    expect(countActiveFilters(state)).toBe(6);
  });
});
