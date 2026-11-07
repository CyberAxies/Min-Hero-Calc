import {
  MAX_BUILD_POINTS,
  availablePoints,
  chooseSpecialization,
  invest,
  nodeStatuses,
  refund,
  resetBuild,
  totalSpent,
  treePointsSpent,
  validateBuild,
} from '../../core/builds';
import type { BuildNodeStatus } from '../../core/builds';
import type { BuildState } from '../../core/types';
import { MOVE_BY_ID, TREE_BY_ID } from '../../packs/minhero/data';
import type { MinionData } from '../../packs/minhero/data';
import { MINHERO_RULES } from '../../packs/minhero/rules';
import { h } from '../dom';
import { setTreeTab, treeTabFor } from '../plannerState';
import { moveIcon } from './moveIcon';
import { attachMoveTooltip } from './moveTooltip';

export interface BuildPlannerOptions {
  minion: MinionData;
  build: BuildState;
  onChange: (build: BuildState) => void;
  onShare?: () => void;
  onSaveCopy?: () => void;
}

function treeName(minion: MinionData, index: number): string {
  const treeId = minion.treeIds[index];
  return (treeId ? TREE_BY_ID.get(treeId)?.name : undefined) ?? `Tree ${index + 1}`;
}

function issueClass(status: BuildNodeStatus): string {
  if (status.node.moves.length === 0) return ' tree-node--empty';
  if (status.points >= status.maxPoints) return ' tree-node--full';
  if (status.issue?.code === 'row-locked') return ' tree-node--locked';
  if (status.issue?.code === 'dependency-locked') return ' tree-node--locked';
  if (status.issue?.code === 'secondary-locked') return ' tree-node--locked';
  return '';
}

function nodeCard(
  status: BuildNodeStatus,
  selectedTree: number,
  onChange: (build: BuildState) => void,
  build: BuildState,
  label: string,
): HTMLElement {
  const className = `tree-node${issueClass(status)}`;
  if (status.node.moves.length === 0) {
    return h(
      'div',
      { class: className },
      h('span', { class: 'tree-node__empty-label' }, 'Empty'),
    );
  }

  const issue = status.issue;
  const minus = h(
    'button',
    {
      type: 'button',
      class: 'icon-btn',
      'aria-label': `Refund a point from ${label}`,
    },
    '−',
  );
  minus.disabled = status.points === 0;
  minus.addEventListener('click', () => onChange(refund(build, selectedTree, status.col, status.row)));

  const plus = h(
    'button',
    {
      type: 'button',
      class: 'icon-btn icon-btn--add',
      'aria-label': `Spend a point in ${label}`,
    },
    '+',
  );
  plus.disabled = issue !== null;
  if (issue) plus.title = issue.message;
  plus.addEventListener('click', () => {
    const result = invest(build, selectedTree, status.col, status.row);
    if (result.ok) onChange(result.build);
  });

  const moves = h('div', { class: 'tree-node__moves' });
  status.node.moves.forEach((moveId, index) => {
    const move = MOVE_BY_ID.get(moveId);
    const learned = index < status.points;
    const next = index === status.points && issue === null;
    const line = h(
      'button',
      {
        type: 'button',
        class: `node-move${learned ? ' node-move--learned' : ''}${next ? ' node-move--next' : ''}`,
        'aria-label': move ? `${move.name}: show description` : moveId,
      },
      move ? moveIcon(move, 'xs') : null,
      h('span', { class: 'node-move__name' }, move?.name ?? moveId),
    );
    if (move) attachMoveTooltip(line, move);
    moves.append(line);
  });

  return h(
    'div',
    { class: className, title: issue?.message ?? '' },
    h(
      'div',
      { class: 'tree-node__head' },
      h('span', { class: 'tree-node__points' }, `${status.points}/${status.maxPoints}`),
      status.node.requiresPreviousRow ? h('span', { class: 'tree-node__dep', title: 'Requires the node above this one' }, '↳') : null,
      h('span', { class: 'tree-node__actions' }, minus, plus),
    ),
    moves,
  );
}

function treeColumns(
  build: BuildState,
  tree: number,
  statuses: BuildNodeStatus[],
  onChange: (build: BuildState) => void,
  label: string,
): HTMLElement {
  const columns = h('div', { class: 'tree-columns' });
  for (let col = 0; col < MINHERO_RULES.treeColumns; col += 1) {
    const column = h('div', { class: 'tree-column' });
    for (let row = 0; row < MINHERO_RULES.treeRows; row += 1) {
      const status = statuses.find(
        (entry) => entry.tree === tree && entry.col === col && entry.row === row,
      );
      if (status) column.append(nodeCard(status, tree, onChange, build, label));
    }
    columns.append(column);
  }
  return columns;
}

export function buildPlanner(options: BuildPlannerOptions): HTMLElement {
  const { build, minion, onChange, onShare, onSaveCopy } = options;
  const spent = totalSpent(build);
  const remaining = availablePoints(build);
  const validation = validateBuild(build);
  const percent = Math.round((spent / MAX_BUILD_POINTS) * 100);
  const statuses = nodeStatuses(build);

  const specButtons = minion.specializationMoves.map((moveId, index) => {
    const move = MOVE_BY_ID.get(moveId);
    const selected = build.primaryTree === index;
    const button = h(
      'button',
      {
        type: 'button',
        class: `spec-button${selected ? ' spec-button--active' : ''}`,
        'aria-pressed': selected ? 'true' : 'false',
      },
      h('span', { class: 'spec-button__tree' }, treeName(minion, index)),
      h('span', { class: 'spec-button__move' }, move?.name ?? 'Starting move'),
    );
    button.addEventListener('click', () => {
      if (build.primaryTree === index) return;
      const result = chooseSpecialization(build, index);
      if (result.ok) onChange(result.build);
    });
    return button;
  });

  const actionButtons: HTMLElement[] = [];
  if (onShare) {
    const share = h('button', { type: 'button', class: 'btn btn--small' }, 'Share build');
    share.addEventListener('click', onShare);
    actionButtons.push(share);
  }
  if (onSaveCopy) {
    const save = h('button', { type: 'button', class: 'btn btn--small' }, 'Save copy');
    save.addEventListener('click', onSaveCopy);
    actionButtons.push(save);
  }
  const reset = h('button', { type: 'button', class: 'btn btn--small btn--ghost' }, 'Reset');
  reset.addEventListener('click', () => {
    if (spent <= 1 && Object.keys(build.allocations).length === 0) return;
    if (window.confirm('Reset this build? All invested points will be refunded.')) {
      onChange(resetBuild(build, true));
    }
  });
  actionButtons.push(reset);

  const warningItems = validation.warnings.filter(
    (warning) => warning.code !== 'unspent-points' && warning.code !== 'no-specialization',
  );
  const messages = [...validation.errors, ...warningItems];
  const messageList = messages.length
    ? h(
        'ul',
        { class: `planner__messages${validation.errors.length ? ' planner__messages--error' : ''}` },
        ...messages.map((message) => h('li', {}, message.message)),
      )
    : null;

  const treeHost = h('div', { class: 'tree-browser' });

  function renderActiveTree(): void {
    const index = Math.min(
      Math.max(treeTabFor(minion.id, build.primaryTree), 0),
      MINHERO_RULES.treeColumns - 1,
    );
    const spentInTree = treePointsSpent(build, index);
    const primaryPoints = treePointsSpent(build, build.primaryTree);
    const secondaryLocked =
      index !== build.primaryTree && primaryPoints < MINHERO_RULES.secondaryTreeUnlockAt - 1;

    const go = (delta: number) => {
      setTreeTab(
        minion.id,
        (index + delta + MINHERO_RULES.treeColumns) % MINHERO_RULES.treeColumns,
      );
      renderActiveTree();
    };

    const prev = h(
      'button',
      { type: 'button', class: 'tree-nav__arrow', 'aria-label': 'Previous tree' },
      '‹',
    );
    prev.addEventListener('click', () => go(-1));
    const next = h(
      'button',
      { type: 'button', class: 'tree-nav__arrow', 'aria-label': 'Next tree' },
      '›',
    );
    next.addEventListener('click', () => go(1));

    const dots = h(
      'div',
      { class: 'tree-nav__dots' },
      ...Array.from({ length: MINHERO_RULES.treeColumns }, (_, dot) => {
        const button = h('button', {
          type: 'button',
          class: `tree-dot${dot === index ? ' tree-dot--active' : ''}`,
          'aria-label': `Show ${treeName(minion, dot)}`,
          'aria-pressed': dot === index ? 'true' : 'false',
        });
        button.addEventListener('click', () => {
          setTreeTab(minion.id, dot);
          renderActiveTree();
        });
        return button;
      }),
    );

    const children: Node[] = [
      h(
        'div',
        { class: 'tree-nav' },
        prev,
        h(
          'div',
          { class: 'tree-nav__center' },
          h('strong', { class: 'tree-nav__name' }, treeName(minion, index)),
          h(
            'span',
            { class: 'tree-nav__meta' },
            `${spentInTree} pts · tree ${index + 1} of ${MINHERO_RULES.treeColumns}`,
          ),
          dots,
        ),
        next,
      ),
      h(
        'section',
        { class: `tree${secondaryLocked ? ' tree--locked' : ''}` },
        treeColumns(build, index, statuses, onChange, treeName(minion, index)),
      ),
    ];
    if (secondaryLocked) {
      children.push(
        h(
          'p',
          { class: 'tree-nav__lock' },
          `Unlocks at ${MINHERO_RULES.secondaryTreeUnlockAt - 1} points in your specialization tree.`,
        ),
      );
    }
    treeHost.replaceChildren(...children);
  }

  const treeSection =
    build.primaryTree < 0
      ? h('p', { class: 'empty-state' }, 'Choose one of the three specializations to start planning.')
      : (() => {
          renderActiveTree();
          return treeHost;
        })();

  return h(
    'section',
    { class: 'planner' },
    h(
      'div',
      { class: 'planner__top' },
      h(
        'div',
        { class: 'planner__count' },
        h('strong', {}, `${spent}`),
        h('span', {}, `/ ${MAX_BUILD_POINTS} points`),
      ),
      h('span', { class: `badge${remaining === 0 ? ' badge--done' : ''}` }, `${remaining} left`),
      h('div', { class: 'meter', 'aria-hidden': 'true' }, h('span', { class: 'meter__bar', style: `width:${percent}%` })),
    ),
    h(
      'div',
      { class: 'spec-picker' },
      h('p', { class: 'field__label' }, 'Specialization'),
      h('div', { class: 'spec-grid' }, ...specButtons),
      h(
        'p',
        { class: 'muted spec-note' },
        build.primaryTree < 0
          ? 'Pick a specialization to unlock its starting move and skill trees. The first point is included.'
          : 'Changing the specialization refunds all invested points.',
      ),
    ),
    messageList,
    treeSection,
    actionButtons.length ? h('div', { class: 'btn-row planner__actions' }, ...actionButtons) : null,
  );
}
