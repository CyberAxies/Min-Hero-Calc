import { formatMoveSummary } from '../../core/format';
import type { MoveData } from '../../packs/minhero/data';
import { TYPE_BY_ID } from '../../packs/minhero/rules';
import { h } from '../dom';
import { moveIcon } from './moveIcon';
import { typePill } from './typePill';

export interface MoveCardOptions {
  learned?: boolean;
  open?: boolean;
  subtitle?: string;
}

export function moveKindLabel(move: MoveData): string {
  if (move.kind === 'passive') return 'Passive';
  if (move.kind === 'global-passive') return 'Global passive';
  return 'Active';
}

function descriptionBody(move: MoveData): HTMLElement {
  if (move.description.length === 0) {
    return h(
      'p',
      { class: 'move-card__summary-text' },
      formatMoveSummary(move) || 'No combat values recorded.',
    );
  }
  return h(
    'ul',
    { class: 'move-card__desc' },
    ...move.description.map((line) => h('li', {}, line)),
  );
}

/** The packaged description list, reused by the move detail page. */
export function moveDescription(move: MoveData): HTMLElement {
  return descriptionBody(move);
}

export function moveCard(move: MoveData, options: MoveCardOptions = {}): HTMLElement {
  const type = move.type ? TYPE_BY_ID.get(move.type) : undefined;
  const attrs: Record<string, string> = {
    class: `move-card${options.learned ? ' move-card--learned' : ''}`,
  };
  if (options.open) attrs.open = '';
  const summary = h(
    'summary',
    { class: 'move-card__summary' },
    moveIcon(move, 'md'),
    h(
      'span',
      { class: 'move-card__heading' },
      h('span', { class: 'move-card__name' }, move.name),
      options.subtitle ? h('span', { class: 'move-card__subtitle' }, options.subtitle) : null,
    ),
    h(
      'span',
      { class: 'move-card__meta' },
      type ? typePill(type) : null,
      // "Active" is the common case; only call out passives so names get room.
      move.kind === 'active' ? null : h('span', { class: 'move-card__kind' }, moveKindLabel(move)),
    ),
  );

  return h(
    'details',
    attrs,
    summary,
    h(
      'div',
      { class: 'move-card__body' },
      descriptionBody(move),
      h(
        'p',
        { class: 'move-card__footer' },
        h('span', {}, `Tier T${move.tier + 1} · level ${move.level}`),
        h('a', { class: 'move-card__link', href: `#/move/${move.id}` }, 'Move page →'),
      ),
    ),
  );
}