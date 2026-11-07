import {
  GEM_QUALITY_DEFAULT,
  GEM_QUALITY_MAX,
  GEM_QUALITY_MIN,
  GEM_STAT_LABELS,
  GEM_STATS,
  GEM_TIER_MAX,
  GEM_TIER_MIN,
  STAT_COLORS,
  clampQuality,
  clampTier,
  emptyLoadout,
  gemSlotCount,
  gemStatValue,
  loadoutSummary,
  totalGemBonus,
  unlockedGemSlots,
} from '../../core/gems';
import type { GemLoadout, GemSlot, GemStat } from '../../core/types';
import { uiAsset } from '../../packs/minhero/assets';
import type { MinionData } from '../../packs/minhero/data';
import { cssUrl, h } from '../dom';

export interface GemPanelOptions {
  minion: MinionData;
  loadout: GemLoadout | null;
  onChange: (loadout: GemLoadout) => void;
}

function gemVisual(gem: GemSlot, size: 'sm' | 'md' = 'md'): HTMLElement {
  const shape = uiAsset(`gemTier${clampTier(gem.tier)}Shape`);
  const style = [
    `--gem-color:${STAT_COLORS[gem.stat]}`,
    shape ? `--gem-shape:${cssUrl(shape)}` : '',
  ].join(';');
  const element = h(
    'span',
    {
      class: `gem gem--${size}`,
      style,
      title: `${GEM_STAT_LABELS[gem.stat]} gem · tier ${gem.tier} · ${gem.quality}% → +${gemStatValue(gem)}`,
      'aria-hidden': 'true',
    },
    h('span', { class: 'gem__tint' }),
  );
  if (shape) {
    element.append(h('img', { class: 'gem__facets', src: shape, alt: '', draggable: 'false' }));
  }
  return element;
}

function socketButton(
  gem: GemSlot | null,
  locked: boolean,
  onSelect: () => void,
): HTMLElement {
  const plate = uiAsset('emptyGemSocket');
  const attrs: Record<string, string> = {
    type: 'button',
    class: `gem-socket${gem ? ' gem-socket--filled' : ''}${locked ? ' gem-socket--locked' : ''}`,
    'aria-label': locked
      ? 'Locked gem socket'
      : gem
        ? `${GEM_STAT_LABELS[gem.stat]} gem, tier ${gem.tier}, plus ${gemStatValue(gem)}`
        : 'Empty gem socket, add a gem',
  };
  if (plate) attrs['style'] = `--gem-socket:${cssUrl(plate)}`;

  const button = h('button', attrs);
  if (gem) button.append(gemVisual(gem));
  if (locked) {
    button.disabled = true;
    const lock = uiAsset('lockedGemSocket');
    if (lock) button.append(h('img', { class: 'gem-socket__lock', src: lock, alt: '' }));
  } else {
    button.addEventListener('click', onSelect);
  }
  return button;
}

/**
 * Gem sockets for one minion: up to three usable sockets plus any locked ones.
 * Editing is local until "Equip"/"Update", so dragging a slider never re-renders
 * the page or steals focus.
 */
export function gemPanel(options: GemPanelOptions): HTMLElement {
  const { minion } = options;
  const slots = gemSlotCount(minion);
  const unlocked = unlockedGemSlots(minion);
  const source = options.loadout ?? [];
  const loadout: GemLoadout = Array.from({ length: slots }, (_, index) => source[index] ?? null);
  const total = totalGemBonus(loadout);
  const summary = loadoutSummary(loadout);

  const sockets = h('div', { class: 'gem-sockets' });
  const editorHost = h('div', { class: 'gem-editor-host' });

  const commit = (next: GemLoadout) => options.onChange(next);

  const renderSockets = () => {
    sockets.replaceChildren(
      ...Array.from({ length: slots }, (_, index) =>
        socketButton(loadout[index] ?? null, index >= unlocked, () => openEditor(index)),
      ),
    );
  };

  function openEditor(index: number): void {
    editorHost.replaceChildren(buildEditor(index));
  }

  function buildEditor(index: number): HTMLElement {
    const existing = loadout[index] ?? null;
    const draft: GemSlot = existing
      ? { ...existing }
      : { stat: 'health', tier: GEM_TIER_MIN, quality: GEM_QUALITY_DEFAULT };

    const preview = h('div', { class: 'gem-editor__preview' });
    const renderPreview = () => {
      preview.replaceChildren(
        gemVisual(draft, 'sm'),
        h('strong', {}, `${GEM_STAT_LABELS[draft.stat]} +${gemStatValue(draft)}`),
        h('span', { class: 'muted' }, `Tier ${draft.tier} · ${draft.quality}%`),
      );
    };

    const statSelect = h(
      'select',
      { class: 'select', 'aria-label': 'Gem stat' },
      ...GEM_STATS.map((stat) => h('option', { value: stat }, GEM_STAT_LABELS[stat])),
    );
    statSelect.value = draft.stat;
    statSelect.addEventListener('change', () => {
      draft.stat = (statSelect.value as GemStat) ?? 'health';
      renderPreview();
    });

    const tierValue = h('span', { class: 'gem-editor__value' }, String(draft.tier));
    const tierInput = h('input', {
      class: 'gem-editor__range-input',
      type: 'range',
      min: String(GEM_TIER_MIN),
      max: String(GEM_TIER_MAX),
      step: '1',
      value: String(draft.tier),
      'aria-label': 'Gem tier',
    });
    tierInput.addEventListener('input', () => {
      draft.tier = clampTier(Number(tierInput.value));
      tierValue.textContent = String(draft.tier);
      renderPreview();
    });

    const qualityValue = h('span', { class: 'gem-editor__value' }, `${draft.quality}%`);
    const qualityInput = h('input', {
      class: 'gem-editor__range-input',
      type: 'range',
      min: String(GEM_QUALITY_MIN),
      max: String(GEM_QUALITY_MAX),
      step: '1',
      value: String(draft.quality),
      'aria-label': 'Gem quality',
    });
    qualityInput.addEventListener('input', () => {
      draft.quality = clampQuality(Number(qualityInput.value));
      qualityValue.textContent = `${draft.quality}%`;
      renderPreview();
    });

    renderPreview();

    const apply = h(
      'button',
      { type: 'button', class: 'btn btn--primary btn--small' },
      existing ? 'Update gem' : 'Equip gem',
    );
    apply.addEventListener('click', () => {
      const next = [...loadout];
      next[index] = { ...draft };
      commit(next);
    });

    const remove = existing
      ? h('button', { type: 'button', class: 'btn btn--danger btn--small' }, 'Remove')
      : null;
    remove?.addEventListener('click', () => {
      const next = [...loadout];
      next[index] = null;
      commit(next);
    });

    const cancel = h('button', { type: 'button', class: 'btn btn--ghost btn--small' }, 'Cancel');
    cancel.addEventListener('click', () => editorHost.replaceChildren());

    return h(
      'div',
      { class: 'gem-editor' },
      preview,
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Stat'), statSelect),
      h(
        'div',
        { class: 'gem-editor__range' },
        h('span', { class: 'field__label' }, 'Tier'),
        tierValue,
        tierInput,
      ),
      h(
        'div',
        { class: 'gem-editor__range' },
        h('span', { class: 'field__label' }, 'Quality'),
        qualityValue,
        qualityInput,
      ),
      h('div', { class: 'btn-row' }, apply, remove, cancel),
    );
  }

  renderSockets();

  const clear =
    total > 0
      ? (() => {
          const button = h('button', { type: 'button', class: 'btn btn--small btn--ghost' }, 'Clear gems');
          button.addEventListener('click', () => commit(emptyLoadout(slots)));
          return button;
        })()
      : null;

  return h(
    'section',
    { class: 'card gem-card' },
    h(
      'div',
      { class: 'card__heading' },
      h('h2', {}, 'Gems'),
      h(
        'span',
        { class: total > 0 ? 'badge badge--done' : 'badge' },
        total > 0
          ? `+${total} stats`
          : unlocked > 0
            ? `${unlocked} socket${unlocked === 1 ? '' : 's'}`
            : 'No sockets',
      ),
    ),
    slots > 0
      ? sockets
      : h('p', { class: 'empty-state' }, 'This minion has no gem sockets.'),
    h(
      'p',
      { class: 'muted gem-summary' },
      summary
        ? `Bonuses: ${summary}.`
        : `${minion.gems.total} usable socket${minion.gems.total === 1 ? '' : 's'}${
            minion.gems.locked > 0 ? ` and ${minion.gems.locked} locked` : ''
          }. Gems add flat stat points on top of level 60.`,
    ),
    clear ? h('div', { class: 'btn-row' }, clear) : null,
    editorHost,
  );
}
