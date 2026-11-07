import type { TypeDef } from '../../packs/minhero/rules';
import { h } from '../dom';

/**
 * A type chip. Icons are the default presentation; the name is always exposed
 * to assistive tech and can be shown visually with `showLabel`.
 */
export function typePill(type: TypeDef, showLabel = false): HTMLElement {
  return h(
    'span',
    {
      class: 'type-pill',
      style: `--type-color:${type.color}`,
      title: type.name,
      'aria-label': type.name,
    },
    h('img', {
      class: 'type-pill__icon',
      src: type.icon,
      alt: '',
      'aria-hidden': 'true',
    }),
    showLabel ? h('span', { class: 'type-pill__label' }, type.name) : null,
  );
}
