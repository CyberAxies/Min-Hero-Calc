import { getTree, totalSpent } from '../core/builds';
import { learnableMoveIds } from '../core/coverage';
import { matchesTarget, mergeFilter } from '../core/filters';
import type { FilterTarget } from '../core/filters';
import { loadoutBonus, loadoutSummary, STAT_COLORS, totalGemBonus } from '../core/gems';
import { formatRating } from '../core/format';
import { formatMultiplier } from '../core/rational';
import {
  decodeBuildShare,
  decodeTeamShare,
  encodeBuildShare,
  encodeTeamShare,
} from '../core/share';
import { getState } from '../core/store';
import type { BuildState, CoverageMode, GemLoadout } from '../core/types';
import { chartCode, multiplierFor } from '../core/typechart';
import {
  MINIONS,
  MINION_BY_ID,
  MOVE_BY_ID,
  PACK_META,
  TREE_BY_ID,
} from '../packs/minhero/data';
import type { MinionData, MoveData } from '../packs/minhero/data';
import { TYPE_BY_ID, TYPES } from '../packs/minhero/rules';
import { navigate } from '../router';
import {
  addBuildToLibrary,
  applySharedBuild,
  buildFromShared,
  clearTeam,
  defaultBuildName,
  deleteBuild,
  deleteSavedTeam,
  ensureDraftBuild,
  firstEmptyTeamSlot,
  loadSavedTeam,
  loadSharedTeam,
  saveCurrentTeam,
  setCoverageMode,
  setEnemySlot,
  setGemLoadout,
  setTeamSlot,
  teamEntries,
  teamSlotFor,
  updateLibraryBuild,
  updateSlotBuild,
} from './actions';
import { buildPlanner } from './components/buildPlanner';
import { coveragePanels } from './components/coverage';
import { askText, openDialog, showShareDialog } from './components/dialog';
import { filterBar } from './components/filterBar';
import { gemPanel } from './components/gemPanel';
import { minionAvatar } from './components/minionAvatar';
import { openMinionPicker } from './components/minionPicker';
import { moveCard } from './components/moveCard';
import { typePill } from './components/typePill';
import { h } from './dom';
import { getFilterState } from './filterState';

function card(title: string, ...body: Array<Node | string | null>): HTMLElement {
  return h('section', { class: 'card' }, h('h2', {}, title), ...body);
}

function typeChips(types: readonly string[], showLabel = false): HTMLElement {
  return h(
    'span',
    { class: 'mini-type-row' },
    ...types.map((typeId) => {
      const type = TYPE_BY_ID.get(typeId);
      return type ? typePill(type, showLabel) : null;
    }),
  );
}

function shareLink(path: string, key: string, token: string): string {
  const base = location.href.split('#')[0];
  return `${base}#/${path}?${key}=${encodeURIComponent(token)}`;
}

function buildSummary(build: BuildState | null): string {
  if (!build) return 'No build yet';
  const minion = MINION_BY_ID.get(build.minionId);
  if (!minion || build.primaryTree < 0) return `${totalSpent(build)} / 17 · no specialization`;
  const tree = getTree(build, build.primaryTree);
  return `${totalSpent(build)} / 17 · ${tree?.name ?? `Tree ${build.primaryTree + 1}`}`;
}

function openSlotPicker(
  currentId: string | null,
  excluded: string[],
  onPick: (minionId: string | null) => void,
): void {
  openMinionPicker({
    title: currentId ? 'Change minion' : 'Choose a minion',
    currentId,
    excludedIds: excluded,
    onPick,
  });
}

interface TeamSlotCardOptions {
  slot: number;
  minionId: string | null;
  build: BuildState | null;
  loadout: GemLoadout | null;
  excluded: string[];
  onChange: (minionId: string | null) => void;
}

function teamSlotCard(options: TeamSlotCardOptions): HTMLElement {
  const minion = options.minionId ? MINION_BY_ID.get(options.minionId) : undefined;
  if (!minion) {
    const add = h(
      'button',
      { type: 'button', class: 'slot-card slot-card--empty' },
      h('span', { class: 'slot-card__plus' }, '+'),
      h('span', { class: 'slot-card__empty-label' }, `Slot ${options.slot + 1}`),
      h('span', { class: 'slot-card__empty-hint' }, 'Choose a minion'),
    );
    add.addEventListener('click', () =>
      openSlotPicker(null, options.excluded, options.onChange),
    );
    return add;
  }

  const change = h('button', { type: 'button', class: 'btn btn--small' }, 'Change');
  change.addEventListener('click', () =>
    openSlotPicker(minion.id, options.excluded, options.onChange),
  );
  const remove = h(
    'button',
    { type: 'button', class: 'btn btn--small btn--ghost', 'aria-label': `Remove ${minion.name}` },
    'Remove',
  );
  remove.addEventListener('click', () => options.onChange(null));
  const build = h('button', { type: 'button', class: 'btn btn--small btn--primary' }, 'Build');
  build.addEventListener('click', () => navigate(`minion/${minion.id}?slot=${options.slot}`));

  return h(
    'article',
    { class: 'slot-card' },
    h(
      'div',
      { class: 'slot-card__top' },
      h('span', { class: 'slot-card__index' }, `Slot ${options.slot + 1}`),
      h('span', { class: 'slot-card__name' }, minion.name),
    ),
    h(
      'div',
      { class: 'slot-card__body' },
      minionAvatar(minion, 'md'),
      h(
        'div',
        { class: 'slot-card__info' },
        typeChips(minion.types, true),
        h(
          'span',
          { class: 'slot-card__family' },
          `#${String(minion.dexNumber).padStart(3, '0')} · ${minion.familyName}`,
        ),
        h('span', { class: 'slot-card__build' }, buildSummary(options.build)),
        loadoutSummary(options.loadout)
          ? h('span', { class: 'slot-card__gems' }, `Gems ${loadoutSummary(options.loadout)}`)
          : null,
      ),
    ),
    h('div', { class: 'slot-card__actions' }, build, change, remove),
    h('a', { class: 'slot-card__detail-link', href: `#/minion/${minion.id}` }, 'View details →'),
  );
}

function enemySlotCard(
  slot: number,
  minionId: string | null,
  excluded: string[],
  onChange: (minionId: string | null) => void,
): HTMLElement {
  const minion = minionId ? MINION_BY_ID.get(minionId) : undefined;
  const button = h(
    'button',
    { type: 'button', class: `enemy-slot${minion ? '' : ' enemy-slot--empty'}` },
    minion ? minionAvatar(minion, 'sm') : h('span', { class: 'enemy-slot__plus' }, '+'),
    h(
      'span',
      { class: 'enemy-slot__label' },
      minion ? minion.name : `Enemy ${slot + 1}`,
    ),
    minion ? typeChips(minion.types) : null,
  );
  button.addEventListener('click', () => openSlotPicker(minionId, excluded, onChange));
  return button;
}

function coverageModeControl(mode: CoverageMode): HTMLElement {
  const select = h(
    'select',
    { class: 'select', 'aria-label': 'Coverage move source' },
    h('option', { value: 'builds' }, 'Use selected builds'),
    h('option', { value: 'learnable' }, 'Use all learnable moves'),
  );
  select.value = mode;
  select.addEventListener('change', () => {
    setCoverageMode(select.value === 'learnable' ? 'learnable' : 'builds');
  });
  return h(
    'label',
    { class: 'field field--inline' },
    h('span', { class: 'field__label' }, 'Coverage source'),
    select,
  );
}

function sharedTeamCard(token: string): HTMLElement {
  const decoded = decodeTeamShare(token);
  const names = decoded.payload.team
    .filter((id): id is string => id !== null)
    .map((id) => MINION_BY_ID.get(id)?.name ?? id);
  const apply = h('button', { type: 'button', class: 'btn btn--primary' }, 'Apply shared team');
  apply.disabled = names.length === 0;
  apply.addEventListener('click', () => {
    loadSharedTeam(decoded.payload);
    navigate('team');
  });
  return h(
    'section',
    { class: 'card card--accent' },
    h(
      'div',
      { class: 'card__heading' },
      h('h2', {}, 'Shared team'),
      h('span', { class: 'badge' }, `${names.length} minions`),
    ),
    h('p', { class: 'muted' }, names.length ? names.join(' · ') : 'This share link contains no minions.'),
    decoded.errors.length
      ? h(
          'ul',
          { class: 'message-list message-list--warning' },
          ...decoded.errors.map((error) => h('li', {}, error)),
        )
      : null,
    h(
      'div',
      { class: 'btn-row' },
      apply,
      h('a', { class: 'btn btn--ghost', href: '#/team' }, 'Dismiss'),
    ),
  );
}

export function teamView(_params: string[], query: URLSearchParams): HTMLElement {
  const state = getState();
  const shareToken = query.get('share');
  const team = teamEntries(state);
  const enemy = teamEntries(state, true);
  const ownIds = state.team.filter((id): id is string => id !== null);
  const enemyIds = state.enemy.filter((id): id is string => id !== null);

  const slots = h(
    'div',
    { class: 'team-grid' },
    ...Array.from({ length: 5 }, (_, slot) => {
      const minionId = state.team[slot] ?? null;
      return teamSlotCard({
        slot,
        minionId,
        build: state.slotBuilds[slot] ?? null,
        loadout: minionId ? (state.loadouts[minionId] ?? null) : null,
        excluded: ownIds.filter((id) => id !== minionId),
        onChange: (next) => setTeamSlot(slot, next),
      });
    }),
  );

  const enemySlots = h(
    'div',
    { class: 'enemy-grid' },
    ...Array.from({ length: 5 }, (_, slot) =>
      enemySlotCard(
        slot,
        state.enemy[slot] ?? null,
        enemyIds.filter((id) => id !== state.enemy[slot]),
        (minionId) => setEnemySlot(slot, minionId),
      ),
    ),
  );

  const share = h('button', { type: 'button', class: 'btn' }, 'Share team');
  share.addEventListener('click', () => {
    const token = encodeTeamShare(state.team, state.enemy, state.slotBuilds, state.loadouts);
    showShareDialog('Share team', shareLink('team', 'share', token));
  });
  const save = h('button', { type: 'button', class: 'btn' }, 'Save team');
  save.addEventListener('click', () => {
    askText('Save team', 'Team name', 'My team', (name) => {
      saveCurrentTeam(name);
    });
  });
  const clear = h('button', { type: 'button', class: 'btn btn--ghost' }, 'Clear team');
  clear.addEventListener('click', () => {
    if (window.confirm('Clear the current team and enemy picks?')) clearTeam();
  });

  return h(
    'div',
    { class: 'view' },
    shareToken ? sharedTeamCard(shareToken) : null,
    h(
      'section',
      { class: 'card' },
      h(
        'div',
        { class: 'card__heading' },
        h('h2', {}, 'Your team'),
        h('span', { class: 'badge' }, `${ownIds.length} / 5`),
      ),
      h('p', { class: 'muted' }, 'Pick up to five minions. Builds shape offense coverage and matchup ratings.'),
      slots,
      h('div', { class: 'btn-row team-toolbar' }, share, save, clear),
    ),
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'card__heading' }, h('h2', {}, 'Enemy team'), h('span', { class: 'badge' }, 'Custom')),
      h('p', { class: 'muted' }, 'Optional. Add the team you expect to face for a direct matchup read.'),
      enemySlots,
    ),
    h(
      'section',
      { class: 'card card--compact' },
      h('div', { class: 'card__heading' }, h('h2', {}, 'Coverage')),
      coverageModeControl(state.settings.coverageMode),
    ),
    coveragePanels(team, enemy, state.settings.coverageMode),
  );
}

interface MinionRow {
  element: HTMLAnchorElement;
  target: FilterTarget;
  name: string;
}

const MINION_SORTS = [
  { value: 'dex', label: 'Dex number' },
  { value: 'name', label: 'Name' },
  { value: 'health', label: 'Highest health' },
  { value: 'attack', label: 'Highest attack' },
  { value: 'healing', label: 'Highest healing' },
  { value: 'speed', label: 'Highest speed' },
  { value: 'gems', label: 'Most gem slots' },
] as const;

function minionTarget(minion: MinionData): FilterTarget {
  const learns = learnableMoveIds(minion.id)
    .map((moveId) => `${moveId} ${MOVE_BY_ID.get(moveId)?.name ?? ''}`)
    .join(' ')
    .toLowerCase();
  return {
    text: `${minion.name} ${minion.familyName} ${minion.types.join(' ')} ${minion.dexNumber}`.toLowerCase(),
    types: minion.types,
    numbers: {
      health: minion.maxStats.health,
      energy: minion.maxStats.energy,
      attack: minion.maxStats.attack,
      healing: minion.maxStats.healing,
      speed: minion.maxStats.speed,
      gems: minion.gems.total + minion.gems.locked,
      stage: minion.stage,
      dex: minion.dexNumber,
    },
    flags: { stage: String(minion.stage) },
    learns,
  };
}

function compareMinions(a: MinionRow, b: MinionRow, sort: string): number {
  if (sort === 'name') return a.name.localeCompare(b.name, 'en');
  if (sort === 'dex') return (a.target.numbers['dex'] ?? 0) - (b.target.numbers['dex'] ?? 0);
  return (
    (b.target.numbers[sort] ?? 0) - (a.target.numbers[sort] ?? 0) ||
    a.name.localeCompare(b.name, 'en')
  );
}

export function minionsView(): HTMLElement {
  const state = getState();
  const count = h('span', { class: 'badge' }, `${MINIONS.length} minions`);
  const empty = h('p', { class: 'empty-state' }, 'No minions match.');
  empty.hidden = true;
  const rows: MinionRow[] = [];
  const grid = h('div', { class: 'minion-grid' });

  for (const minion of MINIONS) {
    const onTeam = state.team.includes(minion.id);
    const element = h(
      'a',
      {
        class: 'minion-card',
        href: `#/minion/${minion.id}`,
        'aria-label': `${minion.name}, ${minion.types.join(' and ')}`,
      },
      h(
        'div',
        { class: 'minion-card__top' },
        minionAvatar(minion, 'md'),
        h(
          'span',
          { class: 'minion-card__title' },
          h('span', { class: 'minion-card__name' }, minion.name),
          h('span', { class: 'minion-card__meta' }, `#${String(minion.dexNumber).padStart(3, '0')} · ${minion.familyName}`),
        ),
        onTeam ? h('span', { class: 'badge badge--done' }, 'Team') : null,
      ),
      h('div', { class: 'minion-card__bottom' }, typeChips(minion.types)),
    );
    grid.append(element);
    rows.push({ element, target: minionTarget(minion), name: minion.name });
  }

  const bar = filterBar({
    slot: 'minions',
    placeholder: 'Search or query: type:fire attack>=200…',
    showTypes: true,
    showLearns: true,
    sorts: MINION_SORTS,
    numbers: [
      { key: 'health', label: 'Min health' },
      { key: 'attack', label: 'Min attack' },
      { key: 'healing', label: 'Min healing' },
      { key: 'speed', label: 'Min speed' },
      { key: 'gems', label: 'Min gem slots' },
    ],
    onChange: apply,
  });

  function apply(): void {
    const filterState = getFilterState('minions');
    const query = mergeFilter(filterState);
    const visible = rows.filter((row) => matchesTarget(row.target, query));
    visible.sort((a, b) => compareMinions(a, b, filterState.sort));
    grid.replaceChildren(...visible.map((row) => row.element));
    empty.hidden = visible.length > 0;
    count.textContent = `${visible.length} / ${MINIONS.length}`;
    bar.setResultCount(visible.length, MINIONS.length);
  }
  apply();

  return h(
    'div',
    { class: 'view' },
    h(
      'section',
      { class: 'card' },
      h(
        'div',
        { class: 'card__heading' },
        h('h2', {}, 'Minions'),
        count,
      ),
      h('p', { class: 'muted' }, `${MINIONS.length} minions across ${PACK_META.counts.families} families. Tap one for stats, moves and its 17-point build planner.`),
      bar.element,
    ),
    grid,
    empty,
  );
}

interface BuildContext {
  build: BuildState;
  slot: number | null;
  libraryId: string | null;
}

function resolveBuildContext(minionId: string, query: URLSearchParams): BuildContext | null {
  const state = getState();
  const slotParam = query.get('slot');
  if (slotParam !== null) {
    const slot = Number.parseInt(slotParam, 10);
    if (Number.isInteger(slot) && state.team[slot] === minionId) {
      const build = state.slotBuilds[slot];
      if (build) return { build, slot, libraryId: null };
    }
  }
  const requestedBuild = query.get('buildId');
  if (requestedBuild) {
    const build = state.builds[requestedBuild];
    if (build && build.minionId === minionId) {
      return { build, slot: null, libraryId: requestedBuild };
    }
  }
  const slot = teamSlotFor(minionId);
  if (slot >= 0) {
    const build = state.slotBuilds[slot];
    if (build) return { build, slot, libraryId: null };
  }
  const draft = state.builds[`draft:${minionId}`];
  if (draft) return { build: draft, slot: null, libraryId: `draft:${minionId}` };
  return null;
}

function updateContext(context: BuildContext, build: BuildState): void {
  if (context.slot !== null) updateSlotBuild(context.slot, build);
  else if (context.libraryId) updateLibraryBuild(context.libraryId, build);
}

const STAT_MAX = (() => {
  const max = { health: 1, energy: 1, attack: 1, healing: 1, speed: 1 };
  for (const minion of MINIONS) {
    for (const stat of Object.keys(max) as Array<keyof typeof max>) {
      max[stat] = Math.max(max[stat], minion.maxStats[stat]);
    }
  }
  return max;
})();

const STAT_LABELS: Array<[keyof typeof STAT_MAX, string]> = [
  ['health', 'Health'],
  ['energy', 'Energy'],
  ['attack', 'Attack'],
  ['healing', 'Healing'],
  ['speed', 'Speed'],
];

function statsCard(minion: MinionData, loadout: GemLoadout | null): HTMLElement {
  const bonus = loadoutBonus(loadout);
  const hasGems = totalGemBonus(loadout) > 0;
  return card(
    'Stats',
    h(
      'div',
      { class: 'stat-grid' },
      ...STAT_LABELS.map(([stat, label]) => {
        const value = minion.maxStats[stat] + bonus[stat];
        return h(
          'div',
          { class: 'stat-row', style: `--stat-color:${STAT_COLORS[stat]}` },
          h(
            'div',
            { class: 'stat-row__head' },
            h('span', { class: 'stat-row__label' }, label),
            h(
              'span',
              { class: 'stat-row__value' },
              `${minion.baseStats[stat]} → ${minion.maxStats[stat]}`,
              bonus[stat] > 0 ? h('span', { class: 'stat-row__bonus' }, ` +${bonus[stat]}`) : null,
            ),
          ),
          h(
            'span',
            { class: 'stat-bar', 'aria-hidden': 'true' },
            h('span', {
              class: 'stat-bar__fill',
              style: `width:${Math.min(100, Math.round((value / STAT_MAX[stat]) * 100))}%`,
            }),
          ),
        );
      }),
    ),
    h(
      'p',
      { class: 'muted stat-note' },
      hasGems
        ? `Includes ${loadoutSummary(loadout)} from gems on top of level ${PACK_META.rules.maxLevel}.`
        : `Base stats → level ${PACK_META.rules.maxLevel}. Bars show maximum relative to the roster.`,
    ),
  );
}

function moveList(moves: MoveData[], title: string, subtitle?: string): HTMLElement {
  return h(
    'section',
    { class: 'move-group' },
    h('h3', { class: 'move-group__title' }, title),
    subtitle ? h('p', { class: 'muted' }, subtitle) : null,
    ...moves.map((move) => moveCard(move)),
  );
}

function allMovesCard(minion: MinionData): HTMLElement {
  const ids = learnableMoveIds(minion.id);
  const moves = ids
    .map((id) => MOVE_BY_ID.get(id))
    .filter((move): move is MoveData => move !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  return h(
    'details',
    { class: 'card details-card' },
    h('summary', {}, h('h2', {}, `All learnable moves (${moves.length})`)),
    h('p', { class: 'muted' }, 'Starting, specialization and every tree move. Expand a move for exact combat values.'),
    ...moves.map((move) => moveCard(move)),
  );
}

function sharedBuildCard(token: string, minion: MinionData, context: BuildContext | null): HTMLElement {
  const decoded = decodeBuildShare(token);
  const shared = decoded.build?.minionId === minion.id ? decoded.build : null;
  const errors = shared
    ? decoded.errors
    : [...decoded.errors, 'This build belongs to a different minion.'];
  const load = h('button', { type: 'button', class: 'btn btn--primary' }, 'Load shared build');
  load.disabled = !shared;
  load.addEventListener('click', () => {
    if (!shared) return;
    let nextContext = context;
    if (!nextContext) {
      const key = ensureDraftBuild(minion.id);
      const draft = getState().builds[key];
      if (draft) nextContext = { build: draft, slot: null, libraryId: key };
    }
    if (!nextContext) return;
    updateContext(nextContext, applySharedBuild(nextContext.build, shared));
    navigate(`minion/${minion.id}${nextContext.slot !== null ? `?slot=${nextContext.slot}` : ''}`);
  });
  const summary = shared
    ? `${totalSpent(buildFromShared(shared, 'shared'))} points · ${shared.primaryTree < 0 ? 'no specialization' : TREE_BY_ID.get(minion.treeIds[shared.primaryTree] ?? '')?.name ?? `Tree ${shared.primaryTree + 1}`}`
    : '';
  return h(
    'section',
    { class: 'card card--accent' },
    h(
      'div',
      { class: 'card__heading' },
      h('h2', {}, 'Shared build'),
      shared ? h('span', { class: 'badge' }, summary) : null,
    ),
    errors.length
      ? h(
          'ul',
          { class: 'message-list message-list--warning' },
          ...errors.map((error) => h('li', {}, error)),
        )
      : h('p', { class: 'muted' }, 'Load this build into the planner, replacing the current allocations.'),
    h('div', { class: 'btn-row' }, load, h('a', { class: 'btn btn--ghost', href: `#/minion/${minion.id}` }, 'Dismiss')),
  );
}

export function minionView(params: string[], query: URLSearchParams): HTMLElement {
  const minionId = params[0] ?? '';
  const minion = MINION_BY_ID.get(minionId);
  if (!minion) {
    return h(
      'div',
      { class: 'view' },
      card(
        'Unknown minion',
        h('p', { class: 'empty-state' }, 'That minion id is not part of the data pack.'),
        h('a', { class: 'btn', href: '#/minions' }, 'Back to minions'),
      ),
    );
  }

  const context = resolveBuildContext(minion.id, query);
  const appState = getState();
  const loadout = appState.loadouts[minion.id] ?? null;
  const sharedToken = query.get('build');
  const teamSlot = teamSlotFor(minion.id);
  const freeSlot = firstEmptyTeamSlot();

  const add = h(
    'button',
    { type: 'button', class: 'btn btn--primary' },
    teamSlot >= 0 ? `In team slot ${teamSlot + 1}` : freeSlot >= 0 ? 'Add to team' : 'Team is full',
  );
  add.disabled = teamSlot >= 0 || freeSlot < 0;
  if (teamSlot < 0 && freeSlot >= 0) {
    add.addEventListener('click', () => setTeamSlot(freeSlot, minion.id));
  }
  const remove = teamSlot >= 0
    ? h('button', { type: 'button', class: 'btn btn--ghost' }, 'Remove from team')
    : null;
  remove?.addEventListener('click', () => setTeamSlot(teamSlot, null));
  const buildLink = teamSlot >= 0
    ? h('a', { class: 'btn btn--ghost', href: `#/minion/${minion.id}?slot=${teamSlot}` }, 'Open slot build')
    : null;

  const family = h(
    'div',
    { class: 'family-list' },
    ...MINIONS.filter((entry) => entry.familyId === minion.familyId).map((entry) =>
      h(
        'a',
        { class: `family-chip${entry.id === minion.id ? ' family-chip--current' : ''}`, href: `#/minion/${entry.id}` },
        minionAvatar(entry, 'sm'),
        h('span', {}, entry.name),
      ),
    ),
  );

  const starting = minion.startingMoves
    .map((id) => MOVE_BY_ID.get(id))
    .filter((move): move is MoveData => move !== undefined);
  const specs = minion.specializationMoves
    .map((id) => MOVE_BY_ID.get(id))
    .filter((move): move is MoveData => move !== undefined);

  const buildBody = context
    ? buildPlanner({
        minion,
        build: context.build,
        onChange: (next) => updateContext(context, next),
        onShare: () => {
          showShareDialog('Share build', shareLink(`minion/${minion.id}`, 'build', encodeBuildShare(context.build)));
        },
        onSaveCopy: () => {
          askText('Save build', 'Build name', context.build.name || defaultBuildName(minion.id), (name) => {
            const id = addBuildToLibrary(context.build, name);
            navigate(`minion/${minion.id}?buildId=${encodeURIComponent(id)}`);
          });
        },
      })
    : h(
        'div',
        { class: 'empty-state' },
        h('p', {}, 'No build selected yet. Start a draft to unlock the three skill trees.'),
        (() => {
          const start = h('button', { type: 'button', class: 'btn btn--primary' }, 'Start build');
          start.addEventListener('click', () => {
            ensureDraftBuild(minion.id);
          });
          return start;
        })(),
      );

  return h(
    'div',
    { class: 'view' },
    h('a', { class: 'back-link', href: '#/minions' }, '← All minions'),
    h(
      'section',
      { class: 'card detail-hero' },
      minionAvatar(minion, 'lg', 'portrait'),
      h(
        'div',
        { class: 'detail-hero__main' },
        h('div', { class: 'detail-hero__title-row' }, h('h1', { class: 'detail-title' }, minion.name), h('span', { class: 'badge' }, `#${String(minion.dexNumber).padStart(3, '0')}`)),
        h('p', { class: 'detail-sub' }, `${minion.familyName} · stage ${minion.stage}${minion.evolvesAt ? ` · evolves at ${minion.evolvesAt}` : ''}`),
        typeChips(minion.types, true),
        h('div', { class: 'btn-row' }, add, buildLink, remove),
      ),
    ),
    sharedToken ? sharedBuildCard(sharedToken, minion, context) : null,
    statsCard(minion, loadout),
    gemPanel({ minion, loadout, onChange: (next) => setGemLoadout(minion.id, next) }),
    card('Build planner', buildBody),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Moves'),
      starting.length ? moveList(starting, 'Starting moves') : null,
      specs.length
        ? moveList(
            specs,
            'Specialization moves',
            minion.specializationMoves
              .map((_, index) => TREE_BY_ID.get(minion.treeIds[index] ?? '')?.name)
              .filter((name): name is string => Boolean(name))
              .join(' · '),
          )
        : null,
      allMovesCard(minion),
    ),
    card('Family', family),
  );
}

function chartDetail(target: HTMLElement, attacker: string, defender: string): void {
  const attackerType = TYPE_BY_ID.get(attacker);
  const defenderType = TYPE_BY_ID.get(defender);
  const value = multiplierFor(attacker, defender);
  const code = chartCode(attacker, defender);
  const examples = MINIONS.filter((minion) => minion.types.includes(defender)).slice(0, 6);
  target.replaceChildren(
    h(
      'div',
      { class: 'chart-detail__head' },
      h('span', { class: 'chart-detail__types' }, attackerType ? typePill(attackerType, true) : null, h('span', { class: 'arrow' }, '→'), defenderType ? typePill(defenderType, true) : null),
      h('strong', { class: `multiplier multiplier--${code}` }, formatMultiplier(value)),
      h('span', { class: 'badge' }, formatRating(code === 'weak' ? 'weak' : code === 'resist' ? 'resist' : 'neutral')),
    ),
    h('p', { class: 'muted' }, `${attackerType?.name ?? attacker} attacking ${defenderType?.name ?? defender}.`),
    h(
      'p',
      { class: `muted${examples.length ? '' : ' is-hidden'}` },
      examples.length
        ? `Examples: ${examples.map((minion) => minion.name).join(', ')}${examples.length === 6 ? '…' : ''}`
        : '',
    ),
  );
}

export function chartView(): HTMLElement {
  const detail = h(
    'div',
    { class: 'chart-detail' },
    h('p', { class: 'muted' }, 'Tap any cell to inspect a single matchup.'),
  );
  const header = h(
    'tr',
    {},
    h('th', { scope: 'col', class: 'type-table__corner' }, 'Atk / Def'),
    ...TYPES.map((type) =>
      h(
        'th',
        { scope: 'col', class: 'type-table__head' },
        h('span', { class: 'type-table__head-inner' }, typePill(type, true)),
      ),
    ),
  );
  const body = h('tbody', {});
  for (const attacker of TYPES) {
    const row = h(
      'tr',
      {},
      h('th', { scope: 'row', class: 'type-table__head type-table__head--row' }, typePill(attacker, true)),
    );
    for (const defender of TYPES) {
      const code = chartCode(attacker.id, defender.id);
      const value = multiplierFor(attacker.id, defender.id);
      const button = h(
        'button',
        {
          type: 'button',
          class: `type-cell type-cell--${code}`,
          'aria-label': `${attacker.name} attacking ${defender.name}: ${formatMultiplier(value)}`,
          title: `${attacker.name} → ${defender.name}: ${formatMultiplier(value)}`,
        },
        code === 'neutral' ? '·' : formatMultiplier(value),
      );
      button.addEventListener('click', () => chartDetail(detail, attacker.id, defender.id));
      row.append(h('td', {}, button));
    }
    body.append(row);
  }

  return h(
    'div',
    { class: 'view' },
    card(
      'Type chart',
      h(
        'p',
        { class: 'muted' },
        'Attacker runs down the left; defender runs across the top. Weak is ×1.5, resist is ×0.67, and dual types multiply — doubly weak is ×2.25, weak + resist cancels to ×1. Swipe sideways on a narrow screen for all 14 defenders.',
      ),
      h('div', { class: 'legend' }, h('span', { class: 'legend__item type-cell--weak' }, '×1.5 weak'), h('span', { class: 'legend__item type-cell--resist' }, '×0.67 resist'), h('span', { class: 'legend__item' }, '×1 neutral')),
      h('div', { class: 'table-scroll type-table-scroll' }, h('table', { class: 'type-table' }, h('thead', {}, header), body)),
      detail,
    ),
  );
}

function extractShare(text: string): { kind: 'team' | 'build'; token: string } | null {
  const raw = text.trim();
  if (!raw) return null;
  if (raw.includes('#')) {
    const hash = raw.slice(raw.indexOf('#') + 1);
    const [, queryPart = ''] = hash.split('?', 2);
    const query = new URLSearchParams(queryPart);
    const team = query.get('share');
    if (team) return { kind: 'team', token: team };
    const build = query.get('build');
    if (build) return { kind: 'build', token: build };
  }
  const buildResult = decodeBuildShare(raw);
  if (buildResult.build) return { kind: 'build', token: raw };
  return { kind: 'team', token: raw };
}

function openImportDialog(): void {
  const input = h('textarea', {
    class: 'text-input text-input--area',
    rows: '4',
    placeholder: 'Paste a team or build share link…',
    'aria-label': 'Share link or token',
  });
  const note = h('p', { class: 'muted' }, 'Team links restore the roster, enemy picks and builds. Build links open in the build library.');
  const form = h(
    'form',
    { class: 'form' },
    input,
    note,
    h(
      'div',
      { class: 'btn-row btn-row--end' },
      h('button', { type: 'button', class: 'btn btn--ghost', 'data-action': 'cancel' }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn btn--primary' }, 'Import'),
    ),
  );
  const dialog = openDialog('Import share link', form);
  const cancel = form.querySelector<HTMLButtonElement>('[data-action="cancel"]');
  cancel?.addEventListener('click', () => dialog.close());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const extracted = extractShare(input.value);
    if (!extracted) {
      note.textContent = 'Paste a share link or token first.';
      return;
    }
    if (extracted.kind === 'team') {
      const decoded = decodeTeamShare(extracted.token);
      if (decoded.errors.length) {
        note.textContent = decoded.errors[0] ?? 'That team link is not valid.';
        return;
      }
      dialog.close();
      loadSharedTeam(decoded.payload);
      navigate('team');
      return;
    }
    const decoded = decodeBuildShare(extracted.token);
    if (!decoded.build) {
      note.textContent = decoded.errors[0] ?? 'That build link is not valid.';
      return;
    }
    const minion = MINION_BY_ID.get(decoded.build.minionId);
    const id = addBuildToLibrary(buildFromShared(decoded.build, `${minion?.name ?? decoded.build.minionId} shared build`));
    dialog.close();
    navigate(`minion/${decoded.build.minionId}?buildId=${encodeURIComponent(id)}`);
  });
}

function dateLabel(value: number): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function savedView(): HTMLElement {
  const state = getState();
  const teams = Object.values(state.savedTeams).sort((a, b) => b.updatedAt - a.updatedAt);
  const builds = Object.entries(state.builds).sort(([, a], [, b]) => b.updatedAt - a.updatedAt);

  const saveCurrent = h('button', { type: 'button', class: 'btn btn--primary' }, 'Save current team');
  saveCurrent.addEventListener('click', () => {
    askText('Save team', 'Team name', 'My team', (name) => saveCurrentTeam(name));
  });
  const importButton = h('button', { type: 'button', class: 'btn' }, 'Import link');
  importButton.addEventListener('click', openImportDialog);

  const teamCards = teams.map((team) => {
    const names = team.slots.filter((id): id is string => Boolean(id)).map((id) => MINION_BY_ID.get(id)?.name ?? id);
    const load = h('button', { type: 'button', class: 'btn btn--small' }, 'Load');
    load.addEventListener('click', () => {
      if (loadSavedTeam(team.id)) navigate('team');
    });
    const share = h('button', { type: 'button', class: 'btn btn--small btn--ghost' }, 'Share');
    share.addEventListener('click', () => {
      const token = encodeTeamShare(team.slots, team.enemy, team.builds, getState().loadouts);
      showShareDialog(`Share ${team.name}`, shareLink('team', 'share', token));
    });
    const remove = h('button', { type: 'button', class: 'btn btn--small btn--danger' }, 'Delete');
    remove.addEventListener('click', () => {
      if (window.confirm(`Delete saved team “${team.name}”?`)) deleteSavedTeam(team.id);
    });
    return h(
      'article',
      { class: 'saved-card' },
      h(
        'div',
        { class: 'saved-card__head' },
        h('strong', {}, team.name),
        h('span', { class: 'muted' }, `Updated ${dateLabel(team.updatedAt)}`),
      ),
      h('p', { class: 'muted' }, names.length ? names.join(' · ') : 'Empty team'),
      h('div', { class: 'btn-row' }, load, share, remove),
    );
  });

  const buildCards = builds.map(([id, build]) => {
    const minion = MINION_BY_ID.get(build.minionId);
    const tree = build.primaryTree >= 0 ? getTree(build, build.primaryTree) : undefined;
    const edit = h('button', { type: 'button', class: 'btn btn--small' }, 'Edit');
    edit.addEventListener('click', () => navigate(`minion/${build.minionId}?buildId=${encodeURIComponent(id)}`));
    const share = h('button', { type: 'button', class: 'btn btn--small btn--ghost' }, 'Share');
    share.addEventListener('click', () => {
      showShareDialog(`Share ${build.name}`, shareLink(`minion/${build.minionId}`, 'build', encodeBuildShare(build)));
    });
    const remove = h('button', { type: 'button', class: 'btn btn--small btn--danger' }, 'Delete');
    remove.addEventListener('click', () => {
      if (window.confirm(`Delete build “${build.name}”?`)) deleteBuild(id);
    });
    return h(
      'article',
      { class: 'saved-card' },
      h(
        'div',
        { class: 'saved-card__head' },
        h('strong', {}, build.name),
        id.startsWith('draft:') ? h('span', { class: 'badge' }, 'Draft') : null,
      ),
      h(
        'p',
        { class: 'muted' },
        `${minion?.name ?? build.minionId} · ${totalSpent(build)} / 17${tree ? ` · ${tree.name}` : ''}`,
      ),
      h('div', { class: 'btn-row' }, edit, share, remove),
    );
  });

  return h(
    'div',
    { class: 'view' },
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'card__heading' }, h('h2', {}, 'Saved setups'), h('span', { class: 'badge' }, `${teams.length + builds.length}`)),
      h('p', { class: 'muted' }, 'Teams restore your current roster. Builds can be edited independently of a team.'),
      h('div', { class: 'btn-row' }, saveCurrent, importButton),
    ),
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'card__heading' }, h('h2', {}, 'Teams'), h('span', { class: 'badge' }, `${teams.length}`)),
      teams.length ? h('div', { class: 'saved-list' }, ...teamCards) : h('p', { class: 'empty-state' }, 'No saved teams yet. Build a team and use “Save current team”.'),
    ),
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'card__heading' }, h('h2', {}, 'Builds'), h('span', { class: 'badge' }, `${builds.length}`)),
      builds.length ? h('div', { class: 'saved-list' }, ...buildCards) : h('p', { class: 'empty-state' }, 'No builds saved yet. Start one from any minion page.'),
    ),
  );
}
