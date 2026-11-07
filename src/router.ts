/**
 * Tiny hash router. Hash routing (rather than History API) is required for a
 * static, offline-first PWA served from arbitrary subpaths - and it means deep
 * links like #/minion/domisteam keep working after an Add to Home Screen.
 */

export type View = (params: string[], query: URLSearchParams) => Node | null;

export interface CurrentRoute {
  name: string;
  params: string[];
  query: URLSearchParams;
}

const routes = new Map<string, View>();
const DEFAULT_ROUTE = 'team';

let mountPoint: HTMLElement | null = null;
let onRendered: ((name: string) => void) | null = null;

export function route(name: string, view: View): void {
  routes.set(name, view);
}

function parseHash(): CurrentRoute {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart = '', queryPart = ''] = raw.split('?', 2);
  const segments = pathPart.split('/').filter(Boolean);
  const [name = DEFAULT_ROUTE, ...params] = segments;
  return { name, params, query: new URLSearchParams(queryPart) };
}

function render(): void {
  if (!mountPoint) return;

  const { name, params, query } = parseHash();
  const resolved = routes.has(name) ? name : DEFAULT_ROUTE;
  const view = routes.get(resolved);
  if (!view) return;

  // A modal belongs to the view that opened it; never let it outlive a route change.
  for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) {
    dialog.close();
  }

  mountPoint.replaceChildren();
  const node = view(params, query);
  if (node) mountPoint.append(node);

  onRendered?.(resolved);
  document.documentElement.dataset['route'] = resolved;
}

/** Re-renders the active route, e.g. after a store mutation. */
export function refresh(): void {
  render();
}

/** The resolved route, including its path parameters and query string. */
export function currentRoute(): CurrentRoute {
  const { name, params, query } = parseHash();
  return {
    name: routes.has(name) ? name : DEFAULT_ROUTE,
    params,
    query,
  };
}

/** Programmatic navigation, e.g. navigate('minion/domisteam'). */
export function navigate(path: string): void {
  const target = `#/${path}`;
  if (location.hash === target) render();
  else location.hash = target;
}

export function startRouting(
  mount: HTMLElement,
  listener?: (name: string) => void,
): void {
  mountPoint = mount;
  onRendered = listener ?? null;
  window.addEventListener('hashchange', render);
  render();
}
