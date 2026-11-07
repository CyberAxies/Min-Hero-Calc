import { matchesTarget, mergeFilter } from '../core/filters';
import type { FilterTarget } from '../core/filters';
import { learnerCount, learnersForMove } from '../core/indexes';
import { MINION_BY_ID, MOVES, MOVE_BY_ID } from '../packs/minhero/data';
import type { MoveData } from '../packs/minhero/data';
import { TYPE_BY_ID } from '../packs/minhero/rules';
import { h } from './dom';
import { filterBar } from './components/filterBar';
import { minionAvatar } from './components/minionAvatar';
import { moveDescription, moveKindLabel } from './components/moveCard';
import { moveIcon } from './components/moveIcon';
import { typePill } from './components/typePill';
import { getFilterState } from './filterState';

/** Moves that at least one starting kit, specialization or tree references. */
const OBTAINABLE_MOVES: readonly MoveData[] = MOVES.filter((move) => move.obtainable);
const HIDDEN_MOVE_COUNT = MOVES.length - OBTAINABLE_MOVES.length;

interface MoveRow {
  element: HTMLAnchorElement;
  target: FilterTarget;
  name: string;
}

const MOVE_SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'damage', label: 'Highest damage' },
  { value: 'energy', label: 'Highest energy cost' },
  { value: 'tier', label: 'Highest tier' },
  { value: 'learners', label: 'Most learners' },
  { value: 'cooldown', label: 'Longest cooldown' },
] as const;

function typeName(typeId: string | null): string {
  return typeId ? (TYPE_BY_ID.get(typeId)?.name ?? typeId) : 'Untyped';
}

function moveMetaLine(move: MoveData): string {
  const parts = [typeName(move.type), moveKindLabel(move)];
  const first = move.description[0];
  if (first) parts.push(first);
  return parts.join(' · ');
}

function moveTarget(move: MoveData, learners: number): FilterTarget {
  return {
    text: `${move.name} ${typeName(move.type)} ${move.classId} ${move.kind} ${move.description.join(' ')}`.toLowerCase(),
    types: move.type ? [move.type] : [],
    numbers: {
      damage: move.damage + move.randomDamage,
      energy: move.energy,
      cooldown: move.cooldown,
      accuracy: move.accuracy,
      tier: move.tier + 1,
      learners,
    },
    flags: { kind: move.kind === 'active' ? 'active' : 'passive' },
  };
}

function compareMoves(a: MoveRow, b: MoveRow, sort: string): number {
  if (sort === 'name') return a.name.localeCompare(b.name, 'en');
  return (
    (b.target.numbers[sort] ?? 0) - (a.target.numbers[sort] ?? 0) ||
    a.name.localeCompare(b.name, 'en')
  );
}

export function movesView(): HTMLElement {
  const count = h('span', { class: 'badge' }, `${OBTAINABLE_MOVES.length} moves`);
  const list = h('div', { class: 'move-list' });
  const empty = h('p', { class: 'empty-state' }, 'No moves match.');
  empty.hidden = true;
  const rows: MoveRow[] = [];

  for (const move of OBTAINABLE_MOVES) {
    const learners = learnerCount(move.id);
    const element = h(
      'a',
      {
        class: 'move-row',
        href: `#/move/${move.id}`,
        'aria-label': `${move.name}, ${typeName(move.type)}, learned by ${learners} minions`,
      },
      moveIcon(move, 'sm'),
      h(
        'span',
        { class: 'move-row__main' },
        h('span', { class: 'move-row__name' }, move.name),
        h('span', { class: 'move-row__meta' }, moveMetaLine(move)),
      ),
      h('span', { class: 'move-row__learners', title: `${learners} minions can learn this` }, `${learners}`),
      h('span', { class: 'move-row__chevron', 'aria-hidden': 'true' }, '›'),
    );
    rows.push({ element, target: moveTarget(move, learners), name: move.name });
  }

  const bar = filterBar({
    slot: 'moves',
    placeholder: 'Search or query: type:fire damage>=50…',
    showTypes: true,
    sorts: MOVE_SORTS,
    numbers: [
      { key: 'damage', label: 'Min damage' },
      { key: 'energy', label: 'Min energy' },
      { key: 'tier', label: 'Min tier' },
      { key: 'learners', label: 'Min learners' },
    ],
    flags: [
      {
        key: 'kind',
        label: 'Kind',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'passive', label: 'Passive' },
        ],
      },
    ],
    onChange: apply,
  });

  function apply(): void {
    const filterState = getFilterState('moves');
    const query = mergeFilter(filterState);
    const visible = rows.filter((row) => matchesTarget(row.target, query));
    visible.sort((a, b) => compareMoves(a, b, filterState.sort));
    list.replaceChildren(...visible.map((row) => row.element));
    empty.hidden = visible.length > 0;
    count.textContent = `${visible.length} / ${OBTAINABLE_MOVES.length}`;
    bar.setResultCount(visible.length, OBTAINABLE_MOVES.length);
  }
  apply();

  return h(
    'div',
    { class: 'view' },
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'card__heading' }, h('h2', {}, 'Moves'), count),
      h(
        'p',
        { class: 'muted' },
        `Every move a minion can learn, with its full game description.${
          HIDDEN_MOVE_COUNT > 0
            ? ` ${HIDDEN_MOVE_COUNT} unreferenced source moves are hidden.`
            : ''
        }`,
      ),
      bar.element,
    ),
    list,
    empty,
  );
}

function moveLineCard(move: MoveData): HTMLElement | null {
  const siblings = MOVES.filter(
    (other) => other.classId === move.classId && other.id !== move.id,
  ).sort((a, b) => a.tier - b.tier);
  if (siblings.length === 0) return null;
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Move line'),
    h(
      'div',
      { class: 'chip-row' },
      ...siblings.map((other) =>
        h(
          'a',
          { class: 'chip-link', href: `#/move/${other.id}` },
          h('span', { class: 'chip-link__tier' }, `T${other.tier + 1}`),
          other.name,
        ),
      ),
    ),
  );
}

function learnersCard(move: MoveData): HTMLElement {
  const learners = learnersForMove(move.id);
  const body = learners.length
    ? h(
        'div',
        { class: 'learner-list' },
        ...learners.map((learner) => {
          const minion = MINION_BY_ID.get(learner.minionId);
          if (!minion) return null;
          return h(
            'a',
            { class: 'learner-row', href: `#/minion/${minion.id}` },
            minionAvatar(minion, 'sm'),
            h(
              'span',
              { class: 'learner-row__main' },
              h('span', { class: 'learner-row__name' }, minion.name),
              h(
                'span',
                { class: 'learner-row__meta' },
                `#${String(minion.dexNumber).padStart(3, '0')} · ${minion.familyName}`,
              ),
            ),
            h(
              'span',
              { class: 'learner-row__sources' },
              ...learner.sources.map((source) =>
                h('span', { class: 'badge' }, source.label),
              ),
            ),
          );
        }),
      )
    : h(
        'p',
        { class: 'empty-state' },
        move.obtainable
          ? 'No minion references this move.'
          : 'This move exists in the source but no starting kit, specialization or tree references it.',
      );

  return h(
    'section',
    { class: 'card' },
    h(
      'div',
      { class: 'card__heading' },
      h('h2', {}, 'Learned by'),
      h('span', { class: 'badge' }, `${learners.length} minions`),
    ),
    body,
  );
}

export function moveView(params: string[]): HTMLElement {
  const moveId = params[0] ?? '';
  const move = MOVE_BY_ID.get(moveId);
  if (!move) {
    return h(
      'div',
      { class: 'view' },
      h(
        'section',
        { class: 'card' },
        h('h2', {}, 'Unknown move'),
        h('p', { class: 'empty-state' }, 'That move id is not part of the data pack.'),
        h('a', { class: 'btn', href: '#/moves' }, 'Back to moves'),
      ),
    );
  }

  const type = move.type ? TYPE_BY_ID.get(move.type) : undefined;
  const classLabel = move.classId.replace(/_/g, ' ');
  const learners = learnersForMove(move.id);

  return h(
    'div',
    { class: 'view' },
    h('a', { class: 'back-link', href: '#/moves' }, '← All moves'),
    h(
      'section',
      { class: 'card detail-hero' },
      moveIcon(move, 'lg'),
      h(
        'div',
        { class: 'detail-hero__main' },
        h(
          'div',
          { class: 'detail-hero__title-row' },
          h('h1', { class: 'detail-title' }, move.name),
          type ? typePill(type, true) : null,
          move.obtainable ? null : h('span', { class: 'badge badge--locked' }, 'Unreferenced'),
        ),
        h(
          'p',
          { class: 'detail-sub' },
          `${moveKindLabel(move)} · ${classLabel} · Tier T${move.tier + 1} (level ${move.level})`,
        ),
        h(
          'p',
          { class: 'detail-sub' },
          `${move.energy} energy · ${learners.length} minions can learn it`,
        ),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'What it does'),
      moveDescription(move),
      h('p', { class: 'move-card__footer' }, `Tier T${move.tier + 1} · level ${move.level}`),
    ),
    moveLineCard(move),
    learnersCard(move),
  );
}
