import type { Team } from '../../core/coverage';
import { matchup, teamDefense, teamOffense } from '../../core/coverage';
import { formatMultiplier } from '../../core/rational';
import { compare } from '../../core/rational';
import type { CoverageMode } from '../../core/types';
import { MINION_BY_ID } from '../../packs/minhero/data';
import { TYPE_BY_ID } from '../../packs/minhero/rules';
import { h } from '../dom';
import { typePill } from './typePill';

function typeChip(typeId: string | null): HTMLElement | null {
  const type = typeId ? TYPE_BY_ID.get(typeId) : undefined;
  return type ? typePill(type) : null;
}

function typeChipWithLabel(typeId: string | null): HTMLElement | null {
  const type = typeId ? TYPE_BY_ID.get(typeId) : undefined;
  return type ? typePill(type, true) : null;
}

function minionName(minionId: string): string {
  return MINION_BY_ID.get(minionId)?.name ?? minionId;
}

function metric(label: string, value: string | number, tone = ''): HTMLElement {
  return h(
    'div',
    { class: `metric${tone ? ` metric--${tone}` : ''}` },
    h('strong', { class: 'metric__value' }, String(value)),
    h('span', { class: 'metric__label' }, label),
  );
}

function offenseSection(team: Team, mode: CoverageMode): HTMLElement {
  const coverage = teamOffense(team, mode);
  const hasTeam = team.some((entry) => entry !== null);
  if (!hasTeam) {
    return h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Offense'),
      h('p', { class: 'empty-state' }, 'Add minions to your team to see type coverage.'),
    );
  }

  const sortedDefenders = [...coverage.defenders].sort(
    (a, b) => compare(a.multiplier, b.multiplier) || a.name.localeCompare(b.name),
  );
  const rows = sortedDefenders.map((entry) =>
    h(
      'div',
      { class: 'coverage-row' },
      h(
        'span',
        { class: 'coverage-row__main' },
        h('span', { class: 'coverage-row__name' }, entry.name),
        h(
          'span',
          { class: 'mini-type-row' },
          ...entry.types.map((typeId) => typeChip(typeId)),
        ),
      ),
      h('span', { class: `multiplier multiplier--${entry.rating}` }, formatMultiplier(entry.multiplier)),
    ),
  );

  return h(
    'section',
    { class: 'card' },
    h(
      'div',
      { class: 'card__heading' },
      h('h2', {}, 'Offense'),
      h('span', { class: 'badge' }, mode === 'builds' ? 'Build moves' : 'All learnable'),
    ),
    h(
      'div',
      { class: 'metrics' },
      metric('Super effective', coverage.covered, 'good'),
      metric('Neutral', coverage.neutral),
      metric('Resisted', coverage.resisted, 'warn'),
    ),
    h(
      'p',
      { class: 'muted' },
      `${coverage.covered} of ${coverage.total} roster minions are hit super effectively by at least one move type your team can use.`,
    ),
    coverage.attackTypes.length
      ? h(
          'div',
          { class: 'type-row' },
          h('span', { class: 'field__label' }, 'Attack types'),
          ...coverage.attackTypes.map((typeId) => typeChipWithLabel(typeId)),
        )
      : h('p', { class: 'empty-state' }, 'No damaging move types found for the current mode.'),
    h(
      'div',
      { class: 'type-coverage-list' },
      ...coverage.byType
        .slice()
        .sort((a, b) => b.coveredCount - a.coveredCount)
        .map((entry) =>
          h(
            'div',
            { class: 'coverage-bar-row' },
            typeChipWithLabel(entry.type),
            h(
              'span',
              { class: 'coverage-bar' },
              h('span', { class: 'coverage-bar__fill', style: `width:${(entry.coveredCount / coverage.total) * 100}%` }),
            ),
            h('span', { class: 'coverage-bar-row__count' }, `${entry.coveredCount}`),
          ),
        ),
    ),
    h(
      'details',
      { class: 'details-block' },
      h('summary', {}, `Every roster minion (${coverage.total})`),
      h('div', { class: 'coverage-list' }, ...rows),
    ),
  );
}

function defenseSection(team: Team): HTMLElement {
  const defense = teamDefense(team);
  if (defense.members.length === 0) {
    return h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Defense'),
      h('p', { class: 'empty-state' }, 'Add minions to see shared weaknesses and incoming threats.'),
    );
  }
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Defense'),
    h('p', { class: 'muted' }, 'Weaknesses are based on each minion’s real type combination.'),
    h(
      'div',
      { class: 'defense-list' },
      ...defense.members.map((member) =>
        h(
          'div',
          { class: 'defense-member' },
          h(
            'div',
            { class: 'defense-member__head' },
            h('span', { class: 'coverage-row__name' }, member.name),
            h(
              'span',
              { class: 'mini-type-row' },
              ...member.types.map((typeId) => typeChip(typeId)),
            ),
          ),
          h(
            'div',
            { class: 'defense-member__row' },
            h('span', { class: 'field__label' }, 'Weak'),
            h(
              'span',
              { class: 'mini-type-row' },
              ...(member.weakTo.length
                ? member.weakTo.map((cell) =>
                    h(
                      'span',
                      { class: 'type-multiplier' },
                      typeChip(cell.type),
                      h('span', {}, formatMultiplier(cell.multiplier)),
                    ),
                  )
                : [h('span', { class: 'muted' }, 'None')]),
            ),
          ),
          h(
            'div',
            { class: 'defense-member__row' },
            h('span', { class: 'field__label' }, 'Resists'),
            h(
              'span',
              { class: 'mini-type-row' },
              ...(member.resists.length
                ? member.resists.map((cell) =>
                    h(
                      'span',
                      { class: 'type-multiplier' },
                      typeChip(cell.type),
                      h('span', {}, formatMultiplier(cell.multiplier)),
                    ),
                  )
                : [h('span', { class: 'muted' }, 'None')]),
            ),
          ),
        ),
      ),
    ),
    h(
      'details',
      { class: 'details-block' },
      h('summary', {}, `Incoming threats (${defense.threats.length})`),
      h(
        'div',
        { class: 'coverage-list' },
        ...defense.threats.map((threat) =>
          h(
            'div',
            { class: 'coverage-row coverage-row--threat' },
            h(
              'span',
              { class: 'coverage-row__main' },
              h('span', { class: 'coverage-row__name' }, threat.name),
              h(
                'span',
                { class: 'coverage-row__meta' },
                `${typeName(threat.attackType)} hits `,
                ...threat.targets.map((target) =>
                  h(
                    'span',
                    { class: 'threat-target' },
                    `${minionName(target.minionId)} ${formatMultiplier(target.multiplier)}`,
                  ),
                ),
              ),
            ),
            h('span', { class: `multiplier multiplier--${threat.bestMultiplier.num > threat.bestMultiplier.den ? 'weak' : 'neutral'}` }, formatMultiplier(threat.bestMultiplier)),
          ),
        ),
      ),
    ),
  );
}

function typeName(typeId: string): string {
  return TYPE_BY_ID.get(typeId)?.name ?? typeId;
}

function matchupSection(team: Team, enemy: Team, mode: CoverageMode): HTMLElement {
  const hasEnemy = enemy.some((entry) => entry !== null);
  if (!hasEnemy) {
    return h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Matchup'),
      h('p', { class: 'empty-state' }, 'Add an enemy team above to compare direct matchups.'),
    );
  }
  const result = matchup(team, enemy, mode);
  const teamRows = team
    .map((entry, index) => (entry ? { entry, index } : null))
    .filter((entry): entry is { entry: NonNullable<Team[number]>; index: number } => entry !== null);
  const enemyRows = enemy
    .map((entry, index) => (entry ? { entry, index } : null))
    .filter((entry): entry is { entry: NonNullable<Team[number]>; index: number } => entry !== null);

  const table = h(
    'table',
    { class: 'matchup-table' },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { scope: 'col' }, 'You'),
        ...enemyRows.map(({ entry }) => h('th', { scope: 'col' }, minionName(entry.minionId))),
      ),
    ),
    h(
      'tbody',
      {},
      ...teamRows.map(({ entry, index }) => {
        const row = h(
          'tr',
          {},
          h('th', { scope: 'row' }, minionName(entry.minionId)),
        );
        for (const enemyRow of enemyRows) {
          const cell = result.cells.find(
            (entryCell) => entryCell.teamSlot === index && entryCell.enemySlot === enemyRow.index,
          );
          if (!cell) continue;
          row.append(
            h(
              'td',
              {
                class: `matchup-cell matchup-cell--${cell.advantage}`,
                title: `${typeName(cell.yourType ?? '')} ${formatMultiplier(cell.yourMultiplier)} vs ${typeName(cell.theirType ?? '')} ${formatMultiplier(cell.theirMultiplier)}`,
              },
              h('span', { class: 'matchup-cell__score' }, `${formatMultiplier(cell.yourMultiplier)} / ${formatMultiplier(cell.theirMultiplier)}`),
              h(
                'span',
                { class: 'matchup-cell__types' },
                typeChip(cell.yourType),
                h('span', { class: 'matchup-cell__arrow' }, '→'),
                typeChip(cell.theirType),
              ),
            ),
          );
        }
        return row;
      }),
    ),
  );

  return h(
    'section',
    { class: 'card' },
    h(
      'div',
      { class: 'card__heading' },
      h('h2', {}, 'Matchup'),
      h('span', { class: 'badge' }, `${result.favorable} favorable · ${result.unfavorable} unfavorable`),
    ),
    h('p', { class: 'muted' }, 'Each cell shows your best multiplier / their best multiplier. Green favors you; red favors the enemy.'),
    h('div', { class: 'table-scroll' }, table),
  );
}

export function coveragePanels(team: Team, enemy: Team, mode: CoverageMode): HTMLElement {
  return h(
    'div',
    { class: 'coverage' },
    offenseSection(team, mode),
    defenseSection(team),
    matchupSection(team, enemy, mode),
  );
}
