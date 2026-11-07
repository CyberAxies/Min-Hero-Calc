/**
 * Minimal DOM helper. Deliberately dependency-free: this app is a handful of
 * grids and tables, so a virtual DOM would only add weight.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

/** Builds a document fragment from a list of nodes, skipping empties. */
export function frag(...children: Array<Node | string | null | undefined>): DocumentFragment {
  const out = document.createDocumentFragment();
  for (const child of children) {
    if (child === null || child === undefined) continue;
    out.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return out;
}

/**
 * Wraps an art-manifest path (`./assets/...`) in a CSS `url()` that survives
 * custom-property substitution.
 *
 * A relative `url()` inside a custom property resolves against the stylesheet
 * that *consumes* it, not the document. In a build the stylesheet lives in
 * `/assets/`, so `./assets/ui/x.png` would become `/assets/assets/ui/x.png`.
 * Resolving against `document.baseURI` first keeps `base: './'`, subpath
 * hosting and `file://` working.
 */
export function cssUrl(path: string | null | undefined): string {
  if (!path) return 'none';
  return `url("${new URL(path, document.baseURI).href}")`;
}
