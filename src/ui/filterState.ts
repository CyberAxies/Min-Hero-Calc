import { emptyFilterState } from '../core/filters';
import type { FilterState } from '../core/filters';

/** Views are full re-renders, so filter state lives outside the DOM. */
export type FilterSlot = 'minions' | 'moves';

const slots: Record<FilterSlot, FilterState> = {
  minions: emptyFilterState('dex'),
  moves: emptyFilterState('name'),
};

export function getFilterState(slot: FilterSlot): FilterState {
  return slots[slot];
}

/** Clears a slot in place so controls holding the object stay in sync. */
export function clearFilterState(slot: FilterSlot, sort: string): void {
  const state = slots[slot];
  const fresh = emptyFilterState(sort);
  Object.assign(state, fresh);
}
