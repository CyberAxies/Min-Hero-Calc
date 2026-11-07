import { TYPE_BY_ID } from '../../packs/minhero/rules';
import type { MoveData } from '../../packs/minhero/data';
import { h } from '../dom';
import { moveDescription, moveKindLabel } from './moveCard';
import { moveIcon } from './moveIcon';
import { typePill } from './typePill';

/**
 * Hover/focus/tap tooltip for a move. One element is shared by the whole app;
 * tapping pins it so touch users can read the description, and any outside tap,
 * scroll or Escape closes it.
 */

let tip: HTMLElement | null = null;
let pinned = false;

function ensureTip(): HTMLElement {
  if (tip) return tip;
  const element = h('div', { class: 'move-tip', role: 'tooltip' });
  element.hidden = true;
  document.body.append(element);

  document.addEventListener('pointerdown', (event) => {
    if (!pinned) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.move-tip') || target.closest('[data-move-tip]')) return;
    hide(true);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide(true);
  });
  window.addEventListener('scroll', () => hide(true), { passive: true });
  window.addEventListener('resize', () => hide(true), { passive: true });

  tip = element;
  return element;
}

function hide(force: boolean): void {
  if (!tip) return;
  if (!force && pinned) return;
  tip.hidden = true;
  pinned = false;
}

function position(anchor: HTMLElement): void {
  if (!tip) return;
  const margin = 8;
  const anchorRect = anchor.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let left = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
  let top = anchorRect.top - tipRect.height - margin;
  if (top < margin) top = anchorRect.bottom + margin;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function fill(element: HTMLElement, move: MoveData): void {
  const type = move.type ? TYPE_BY_ID.get(move.type) : undefined;
  element.replaceChildren(
    h(
      'div',
      { class: 'move-tip__head' },
      moveIcon(move, 'sm'),
      h('span', { class: 'move-tip__name' }, move.name),
      type ? typePill(type, true) : null,
    ),
    moveDescription(move),
    h(
      'p',
      { class: 'move-tip__meta' },
      `${moveKindLabel(move)} · Tier T${move.tier + 1} · ${move.energy} energy`,
    ),
  );
}

function show(anchor: HTMLElement, move: MoveData, pin: boolean): void {
  const element = ensureTip();
  const sameMove = element.dataset['moveId'] === move.id;
  if (!pin && pinned && !sameMove) pinned = false;
  if (!sameMove) {
    element.dataset['moveId'] = move.id;
    fill(element, move);
  }
  element.hidden = false;
  if (pin) pinned = true;
  position(anchor);
}

export function attachMoveTooltip(anchor: HTMLElement, move: MoveData): void {
  anchor.dataset['moveTip'] = move.id;
  anchor.addEventListener('pointerenter', () => show(anchor, move, false));
  anchor.addEventListener('pointerleave', () => hide(false));
  anchor.addEventListener('focus', () => show(anchor, move, false));
  anchor.addEventListener('blur', () => hide(false));
  anchor.addEventListener('click', (event) => {
    event.stopPropagation();
    const alreadyPinned = pinned && tip?.dataset['moveId'] === move.id;
    if (alreadyPinned) hide(true);
    else show(anchor, move, true);
  });
}
