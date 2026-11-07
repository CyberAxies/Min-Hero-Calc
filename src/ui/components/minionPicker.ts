import { MINIONS } from '../../packs/minhero/data';
import type { MinionData } from '../../packs/minhero/data';
import { TYPES } from '../../packs/minhero/rules';
import { h } from '../dom';
import { openDialog } from './dialog';
import { minionAvatar } from './minionAvatar';
import { typePill } from './typePill';

export interface MinionPickerOptions {
  title?: string;
  currentId?: string | null;
  excludedIds?: Iterable<string>;
  onPick: (minionId: string | null) => void;
}

interface PickerRow {
  element: HTMLButtonElement;
  search: string;
  types: string;
  minion: MinionData;
}

export function openMinionPicker(options: MinionPickerOptions): void {
  const excluded = new Set(options.excludedIds ?? []);
  const search = h('input', {
    class: 'text-input',
    type: 'search',
    placeholder: 'Search name or family…',
    'aria-label': 'Search minions',
  });
  const typeSelect = h(
    'select',
    { class: 'select', 'aria-label': 'Filter by type' },
    h('option', { value: '' }, 'All types'),
    ...TYPES.map((type) => h('option', { value: type.id }, type.name)),
  );
  const list = h('div', { class: 'picker__list' });
  const empty = h('p', { class: 'empty-state picker__empty' }, 'No minions match.');
  empty.hidden = true;
  const rows: PickerRow[] = [];

  let dialog: HTMLDialogElement | null = null;
  for (const minion of MINIONS) {
    const isExcluded = excluded.has(minion.id);
    const row = h(
      'button',
      {
        type: 'button',
        class: `picker-row${minion.id === options.currentId ? ' picker-row--current' : ''}`,
        'aria-label': `${minion.name}${isExcluded ? ', already selected' : ''}`,
      },
      minionAvatar(minion, 'sm'),
      h(
        'span',
        { class: 'picker-row__main' },
        h('span', { class: 'picker-row__name' }, minion.name),
        h(
          'span',
          { class: 'picker-row__meta' },
          `#${String(minion.dexNumber).padStart(3, '0')} · ${minion.familyName}`,
        ),
      ),
      h(
        'span',
        { class: 'picker-row__types' },
        ...minion.types.map((typeId) => {
          const type = TYPES.find((entry) => entry.id === typeId);
          return type ? typePill(type) : null;
        }),
      ),
      isExcluded ? h('span', { class: 'badge' }, 'Selected') : null,
    );
    row.disabled = isExcluded;
    row.addEventListener('click', () => {
      options.onPick(minion.id);
      dialog?.close();
    });
    list.append(row);
    rows.push({
      element: row,
      search: `${minion.name} ${minion.familyName} ${minion.types.join(' ')}`.toLowerCase(),
      types: minion.types.join(' '),
      minion,
    });
  }

  const clear = options.currentId
    ? h('button', { type: 'button', class: 'btn btn--ghost' }, 'Clear slot')
    : null;
  clear?.addEventListener('click', () => {
    options.onPick(null);
    dialog?.close();
  });

  const update = () => {
    const query = search.value.trim().toLowerCase();
    const type = typeSelect.value;
    let visible = 0;
    for (const row of rows) {
      const matchesQuery = query === '' || row.search.includes(query);
      const matchesType = type === '' || row.minion.types.includes(type);
      row.element.hidden = !(matchesQuery && matchesType);
      if (!row.element.hidden) visible += 1;
    }
    empty.hidden = visible > 0;
    empty.textContent = rows.length === 0 ? 'No minions available.' : 'No minions match.';
  };
  search.addEventListener('input', update);
  typeSelect.addEventListener('change', update);

  dialog = openDialog(
    options.title ?? 'Choose a minion',
    h(
      'div',
      { class: 'picker' },
      h('div', { class: 'picker__controls' }, search, typeSelect),
      list,
      empty,
      clear ? h('div', { class: 'btn-row btn-row--end' }, clear) : null,
    ),
    { wide: true },
  );
  search.focus();
}
