import { moveIconPath } from '../../packs/minhero/assets';
import type { MoveData } from '../../packs/minhero/data';
import { TYPE_BY_ID } from '../../packs/minhero/rules';
import { h } from '../dom';
import { typeColor } from './minionAvatar';

/**
 * Sizes map to the game art: `md` is the default summary size, `xs` fits a
 * skill-tree row, and `lg` is for move detail headers.
 */
export type MoveIconSize = 'xs' | 'sm' | 'md' | 'lg';

/**
 * The in-game move icon (already framed by the source art), ringed with the
 * move's type colour. Falls back to the type icon when a move has no art.
 */
export function moveIcon(move: MoveData, size: MoveIconSize = 'md'): HTMLElement {
  const color = move.type ? typeColor(move.type) : 'var(--text-dim)';
  const wrapper = h('span', {
    class: `move-icon move-icon--${size}`,
    style: `--move-color:${color}`,
    'aria-hidden': 'true',
    title: move.name,
  });

  const source = moveIconPath(move.icon);
  if (source) {
    wrapper.append(
      h('img', {
        class: 'move-icon__img',
        src: source,
        alt: '',
        loading: 'lazy',
        decoding: 'async',
        draggable: 'false',
      }),
    );
    return wrapper;
  }

  const type = move.type ? TYPE_BY_ID.get(move.type) : undefined;
  if (type) {
    wrapper.classList.add('move-icon--type-fallback');
    wrapper.append(
      h('img', { class: 'move-icon__img', src: type.icon, alt: '', draggable: 'false' }),
    );
  } else {
    wrapper.classList.add('move-icon--empty');
    wrapper.append(h('span', { class: 'move-icon__glyph' }, '•'));
  }
  return wrapper;
}
