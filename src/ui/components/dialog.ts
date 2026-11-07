import { h } from '../dom';

export interface DialogOptions {
  wide?: boolean;
}

export function openDialog(title: string, body: Node, options: DialogOptions = {}): HTMLDialogElement {
  for (const existing of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) {
    existing.close();
  }
  const dialog = h('dialog', {
    class: options.wide ? 'dialog dialog--wide' : 'dialog',
  });
  const close = h(
    'button',
    { type: 'button', class: 'dialog__close', 'aria-label': 'Close' },
    '×',
  );
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => dialog.remove());
  dialog.append(
    h(
      'div',
      { class: 'dialog__header' },
      h('h2', { class: 'dialog__title' }, title),
      close,
    ),
    h('div', { class: 'dialog__body' }, body),
  );
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

export function showShareDialog(title: string, link: string): void {
  const input = h('input', {
    class: 'text-input text-input--mono',
    type: 'text',
    readonly: '',
    value: link,
    'aria-label': 'Share link',
  });
  const copy = h('button', { type: 'button', class: 'btn btn--primary' }, 'Copy link');
  const note = h('p', { class: 'muted share-note' }, 'Anyone with this link can load the shared setup.');
  copy.addEventListener('click', () => {
    void copyText(link).then((ok) => {
      copy.textContent = ok ? 'Copied' : 'Select and copy';
      if (!ok) {
        input.focus();
        input.select();
      }
    });
  });
  openDialog(
    title,
    h(
      'div',
      { class: 'share-box' },
      h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Link'), input),
      note,
      h('div', { class: 'btn-row' }, copy),
    ),
  );
}

export function askText(
  title: string,
  label: string,
  defaultValue: string,
  onSubmit: (value: string) => void,
): void {
  const input = h('input', {
    class: 'text-input',
    type: 'text',
    value: defaultValue,
    'aria-label': label,
  });
  const form = h(
    'form',
    { class: 'form' },
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), input),
    h(
      'div',
      { class: 'btn-row btn-row--end' },
      h('button', { type: 'button', class: 'btn btn--ghost', 'data-action': 'cancel' }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn btn--primary' }, 'Save'),
    ),
  );
  const dialog = openDialog(title, form);
  const cancel = form.querySelector<HTMLButtonElement>('[data-action="cancel"]');
  cancel?.addEventListener('click', () => dialog.close());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      input.focus();
      return;
    }
    dialog.close();
    onSubmit(value);
  });
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the manual selection path.
  }
  return false;
}
