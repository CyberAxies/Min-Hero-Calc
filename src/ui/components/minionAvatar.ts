import { minionSpritePath, uiAsset } from '../../packs/minhero/assets';
import type { MinionData } from '../../packs/minhero/data';
import { TYPE_BY_ID } from '../../packs/minhero/rules';
import { cssUrl, h } from '../dom';

/**
 * `icon` is the small squircle used in lists; `portrait` is the taller Pedia
 * stage used in the detail hero.
 */
export type AvatarFrame = 'icon' | 'portrait';
export type AvatarSize = 'sm' | 'md' | 'lg';

export function typeColor(typeId: string | null | undefined): string {
  if (!typeId) return 'var(--text-dim)';
  return TYPE_BY_ID.get(typeId)?.color ?? 'var(--text-dim)';
}

export function typeGradientStyle(types: readonly string[]): string {
  const [first = '', second = ''] = types;
  return `--type-a:${typeColor(first)};--type-b:${typeColor(second || first)}`;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    const word = words[0] ?? '';
    return word.slice(0, 2).toUpperCase();
  }
  return words
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

function frameStyle(minion: MinionData, frame: AvatarFrame): string {
  const style = [typeGradientStyle(minion.types)];
  const frameUrl = uiAsset(frame === 'portrait' ? 'minionPortraitStage' : 'minionIconBackground');
  if (frameUrl) style.push(`--avatar-frame:${cssUrl(frameUrl)}`);
  return style.join(';');
}

export function minionAvatar(
  minion: MinionData,
  size: AvatarSize = 'md',
  frame: AvatarFrame = 'icon',
): HTMLElement {
  const sprite = minionSpritePath(minion.id);
  const fallback = h('span', { class: 'minion-avatar__text' }, initials(minion.name));
  const wrapper = h(
    'div',
    {
      class: `minion-avatar minion-avatar--${size} minion-avatar--${frame}`,
      style: frameStyle(minion, frame),
      'aria-hidden': 'true',
      title: minion.name,
    },
    fallback,
  );

  if (sprite) {
    fallback.hidden = true;
    const image = h('img', {
      class: 'minion-avatar__sprite',
      src: sprite,
      alt: '',
      // The detail hero is above the fold; everything else stays lazy.
      loading: size === 'lg' ? 'eager' : 'lazy',
      decoding: 'async',
      draggable: 'false',
    });
    // Fall back to initials instead of a broken-image icon.
    image.addEventListener('error', () => {
      image.remove();
      fallback.hidden = false;
    });
    wrapper.prepend(image);
  }

  return wrapper;
}
