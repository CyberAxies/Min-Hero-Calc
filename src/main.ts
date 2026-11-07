import './styles/fonts.css';
import './styles/tokens.css';
import './style.css';
import { subscribe } from './core/store';
import { refresh, route, startRouting } from './router';
import { h } from './ui/dom';
import { applyTheme } from './ui/theme';
import { chartView, minionView, minionsView, moveView, movesView, savedView, teamView } from './ui/views';

applyTheme();

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('#app mount point is missing from index.html');

const TABS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'team', label: 'Team' },
  { id: 'minions', label: 'Minions' },
  { id: 'moves', label: 'Moves' },
  { id: 'chart', label: 'Types' },
  { id: 'saved', label: 'Saved' },
];

const header = h(
  'header',
  { class: 'app-header' },
  h('h1', { class: 'app-header__title' }, 'Min Hero Calc'),
  h('p', { class: 'app-header__sub' }, 'Tower of Sages'),
);

const main = h('main', { id: 'view', class: 'app-main' });

const tabs = h('nav', { class: 'tabs', 'aria-label': 'Sections' });
const links = new Map<string, HTMLAnchorElement>();
for (const tab of TABS) {
  const link = h('a', { class: 'tab', href: `#/${tab.id}` }, tab.label);
  links.set(tab.id, link);
  tabs.append(link);
}
const footer = h(
  'footer',
  { class: 'app-footer' },
  'Data from Min Hero: Tower of Sages © ToyChestGames. Used with permission.',
);

root.append(header, main, footer, tabs);

route('team', teamView);
route('minions', minionsView);
route('minion', minionView);
route('moves', movesView);
route('move', moveView);
route('chart', chartView);
route('saved', savedView);

startRouting(main, (active) => {
  const tab = active === 'minion' ? 'minions' : active === 'move' ? 'moves' : active;
  for (const [id, link] of links) {
    if (id === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
});

subscribe(() => refresh());
