import { describe, expect, it } from 'vitest';
import { createBuild, invest } from '../src/core/builds';
import {
  decodeBuildShare,
  decodeTeamShare,
  encodeBuildShare,
  encodeTeamShare,
} from '../src/core/share';

function validBuild() {
  const base = createBuild('domisteam', 0, 'share-build', 'Share build');
  const result = invest(base, 0, 0, 0);
  if (!result.ok) throw new Error(result.error.message);
  return result.build;
}

function rawToken(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

describe('share codec', () => {
  it('round-trips a team and its builds', () => {
    const build = validBuild();
    const token = encodeTeamShare(
      ['domisteam', 'tortastone', null, null, null],
      ['falcona', null, null, null, null],
      [build, null, null, null, null],
    );
    const decoded = decodeTeamShare(token);
    expect(decoded.errors).toEqual([]);
    expect(decoded.payload.team).toEqual(['domisteam', 'tortastone', null, null, null]);
    expect(decoded.payload.enemy).toEqual(['falcona', null, null, null, null]);
    expect(decoded.payload.builds[0]).toEqual({
      minionId: 'domisteam',
      primaryTree: 0,
      allocations: { '0:0:0': 1 },
    });
  });

  it('round-trips a build link', () => {
    const build = validBuild();
    const decoded = decodeBuildShare(encodeBuildShare(build));
    expect(decoded.errors).toEqual([]);
    expect(decoded.build?.minionId).toBe('domisteam');
    expect(decoded.build?.allocations).toEqual({ '0:0:0': 1 });
  });

  it('rejects malformed links', () => {
    expect(decodeTeamShare('not-a-valid-token').errors.length).toBeGreaterThan(0);
    expect(decodeBuildShare('not-a-valid-token').errors.length).toBeGreaterThan(0);
    expect(
      decodeTeamShare(rawToken({ v: 99, team: [], enemy: [], builds: [] })).errors.length,
    ).toBeGreaterThan(0);
  });

  it('drops unknown minions and mismatched build slots', () => {
    const build = validBuild();
    const decoded = decodeTeamShare(
      encodeTeamShare(
        ['not-a-minion', null, null, null, null],
        [null, null, null, null, null],
        [build, null, null, null, null],
      ),
    );
    expect(decoded.payload.team[0]).toBeNull();
    expect(decoded.errors.some((error) => error.includes('unknown minion'))).toBe(true);
    expect(decoded.payload.builds[0]).toBeNull();
    expect(decoded.errors.some((error) => error.includes('does not match'))).toBe(true);
  });

  it('round-trips gem loadouts for team minions', () => {
    const token = encodeTeamShare(
      ['seiryu', null, null, null, null],
      [null, null, null, null, null],
      [null, null, null, null, null],
      { seiryu: [{ stat: 'speed', tier: 4, quality: 110 }, null, null] },
    );
    const decoded = decodeTeamShare(token);
    expect(decoded.errors).toEqual([]);
    expect(decoded.payload.gems?.['seiryu']).toEqual([
      { stat: 'speed', tier: 4, quality: 110 },
      null,
      null,
    ]);
  });

  it('sanitises gem data from share links', () => {
    const token = rawToken({
      v: 1,
      team: ['seiryu', null, null, null, null],
      enemy: [null, null, null, null, null],
      builds: [null, null, null, null, null],
      gems: {
        seiryu: [{ stat: 'speed', tier: 99, quality: 10 }, { stat: 'nope', tier: 2, quality: 100 }],
        'not-a-minion': [{ stat: 'health', tier: 1, quality: 100 }],
      },
    });
    const decoded = decodeTeamShare(token);
    expect(decoded.payload.gems?.['seiryu']).toEqual([
      { stat: 'speed', tier: 11, quality: 60 },
      null,
      null,
    ]);
    expect(decoded.payload.gems?.['not-a-minion']).toBeUndefined();
  });

  it('rejects invalid build allocations in shared links', () => {
    const token = rawToken({
      v: 1,
      team: ['domisteam', null, null, null, null],
      enemy: [null, null, null, null, null],
      builds: [
        {
          minionId: 'domisteam',
          primaryTree: 0,
          allocations: { '0:0:1': 1 },
        },
        null,
        null,
        null,
        null,
      ],
    });
    const decoded = decodeTeamShare(token);
    expect(decoded.payload.builds[0]).toBeNull();
    expect(decoded.errors.some((error) => error.includes('invalid'))).toBe(true);
  });
});
