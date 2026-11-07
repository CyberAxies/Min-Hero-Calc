import { countActiveFilters } from '../../core/filters';
import { TYPES } from '../../packs/minhero/rules';
import { h } from '../dom';
import { clearFilterState, getFilterState } from '../filterState';
import type { FilterSlot } from '../filterState';

export interface FilterBarOptions {
  slot: FilterSlot;
  placeholder: string;
  sorts: ReadonlyArray<{ value: string; label: string }>;
  numbers?: ReadonlyArray<{ key: string; label: string }>;
  flags?: ReadonlyArray<{
    key: string;
    label: string;
    options: ReadonlyArray<{ value: string; label: string }>;
  }>;
  showTypes?: boolean;
  showLearns?: boolean;
  onChange: () => void;
}

export interface FilterBar {
  element: HTMLElement;
  setResultCount: (visible: number, total: number) => void;
}

/**
 * Shared filter controls. Reads and writes the slot state in `filterState.ts`
 * and calls `onChange` after every edit; the owning view re-runs matching and
 * sorting without re-rendering the page, so focus and typing are preserved and
 * `Advanced` stays open.
 */
export function filterBar(options: FilterBarOptions): FilterBar {
  const state = getFilterState(options.slot);

  const search = h('input', {
    class: 'text-input',
    type: 'search',
    placeholder: options.placeholder,
    'aria-label': options.placeholder,
    value: state.query,
  });

  const chips = new Map<string, HTMLButtonElement>();
  const syncChips = () => {
    for (const [id, button] of chips) {
      const included = state.types.includes(id);
      const excluded = state.excludedTypes.includes(id);
      button.classList.toggle('type-chip--include', included);
      button.classList.toggle('type-chip--exclude', excluded);
      button.setAttribute('aria-pressed', included ? 'true' : excluded ? 'mixed' : 'false');
    }
  };

  const chipRow = options.showTypes
    ? h(
        'div',
        { class: 'type-chip-row', role: 'group', 'aria-label': 'Filter by type' },
        ...TYPES.map((type) => {
          const button = h(
            'button',
            {
              type: 'button',
              class: 'type-chip',
              title: `${type.name}: tap to include, tap again to exclude`,
              'aria-label': type.name,
            },
            h('img', { class: 'type-chip__icon', src: type.icon, alt: '' }),
          );
          button.addEventListener('click', () => {
            if (state.types.includes(type.id)) {
              state.types = state.types.filter((id) => id !== type.id);
              state.excludedTypes = [...state.excludedTypes, type.id];
            } else if (state.excludedTypes.includes(type.id)) {
              state.excludedTypes = state.excludedTypes.filter((id) => id !== type.id);
            } else {
              state.types = [...state.types, type.id];
            }
            syncChips();
            notify();
          });
          chips.set(type.id, button);
          return button;
        }),
      )
    : null;

  const sortSelect = h(
    'select',
    { class: 'select', 'aria-label': 'Sort order' },
    ...options.sorts.map((sort) => h('option', { value: sort.value }, sort.label)),
  );
  if (options.sorts.some((sort) => sort.value === state.sort)) sortSelect.value = state.sort;
  else if (options.sorts[0]) {
    state.sort = options.sorts[0].value;
    sortSelect.value = state.sort;
  }
  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value;
    notify();
  });

  const numberInputs = new Map<string, HTMLInputElement>();
  const numberFields = (options.numbers ?? []).map((field) => {
    const input = h('input', {
      class: 'text-input',
      type: 'number',
      inputmode: 'numeric',
      min: '0',
      placeholder: 'Any',
      value: state.numbers[field.key] ?? '',
      'aria-label': field.label,
    });
    input.addEventListener('input', () => {
      state.numbers[field.key] = input.value;
      notify();
    });
    numberInputs.set(field.key, input);
    return h(
      'label',
      { class: 'field' },
      h('span', { class: 'field__label' }, field.label),
      input,
    );
  });

  const flagSelects = new Map<string, HTMLSelectElement>();
  const flagFields = (options.flags ?? []).map((flag) => {
    const select = h(
      'select',
      { class: 'select', 'aria-label': flag.label },
      h('option', { value: '' }, 'Any'),
      ...flag.options.map((entry) => h('option', { value: entry.value }, entry.label)),
    );
    select.value = state.flags[flag.key] ?? '';
    select.addEventListener('change', () => {
      state.flags[flag.key] = select.value;
      notify();
    });
    flagSelects.set(flag.key, select);
    return h(
      'label',
      { class: 'field' },
      h('span', { class: 'field__label' }, flag.label),
      select,
    );
  });

  let learnsInput: HTMLInputElement | null = null;
  const learnsField = options.showLearns
    ? (() => {
        const input = h('input', {
          class: 'text-input',
          type: 'text',
          placeholder: 'e.g. flurry',
          value: state.learns,
          'aria-label': 'Learns move',
        });
        input.addEventListener('input', () => {
          state.learns = input.value;
          notify();
        });
        learnsInput = input;
        return h(
          'label',
          { class: 'field field--wide' },
          h('span', { class: 'field__label' }, 'Learns move'),
          input,
        );
      })()
    : null;

  const advancedBody = h(
    'div',
    { class: 'filter-advanced__body' },
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field__label' }, 'Sort'),
      sortSelect,
    ),
    ...numberFields,
    ...flagFields,
    learnsField,
  );

  const advanced = h(
    'details',
    { class: 'filter-advanced' },
    h('summary', {}, 'Advanced filters'),
    advancedBody,
  );

  const result = h('span', { class: 'filter-bar__count' }, '');
  const active = h('span', { class: 'filter-bar__active' });
  active.hidden = true;
  const reset = h('button', { type: 'button', class: 'btn btn--small btn--ghost' }, 'Reset');
  reset.addEventListener('click', () => {
    clearFilterState(options.slot, options.sorts[0]?.value ?? '');
    search.value = '';
    sortSelect.value = state.sort;
    for (const [key, input] of numberInputs) input.value = state.numbers[key] ?? '';
    for (const [key, select] of flagSelects) select.value = state.flags[key] ?? '';
    if (learnsInput) learnsInput.value = state.learns;
    syncChips();
    notify();
  });

  const syncActive = () => {
    const count = countActiveFilters(state);
    active.hidden = count === 0;
    active.textContent = count === 0 ? '' : `${count} active`;
  };

  function notify(): void {
    syncActive();
    options.onChange();
  }

  search.addEventListener('input', () => {
    state.query = search.value;
    notify();
  });

  const element = h(
    'div',
    { class: 'filter-bar' },
    search,
    chipRow,
    h(
      'div',
      { class: 'filter-bar__status' },
      result,
      active,
      h('span', { class: 'filter-bar__spacer' }),
      reset,
    ),
    advanced,
  );

  syncChips();
  syncActive();

  return {
    element,
    setResultCount: (visible, total) => {
      result.textContent = `${visible} of ${total} shown`;
    },
  };
}
