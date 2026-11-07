import { describe, expect, it } from 'vitest';
import {
  ASSET_MANIFEST,
  MINION_SPRITE_BY_ID,
  MOVE_ICON_BY_NAME,
  UI_ASSETS,
  minionSpritePath,
  moveIconPath,
  uiAsset,
} from '../src/packs/minhero/assets';
import { MINIONS, MOVES } from '../src/packs/minhero/data';

const GEM_TIER_COUNT = 11;

describe('imported Min Hero assets', () => {
  it('has a sprite for every minion', () => {
    expect(MINION_SPRITE_BY_ID.size).toBe(MINIONS.length);
    for (const minion of MINIONS) {
      expect(minionSpritePath(minion.id), minion.id).toBe(`./assets/minions/${minion.id}.png`);
    }
    expect(ASSET_MANIFEST.stats.minionSprites).toBe(MINIONS.length);
  });

  it('has an icon for every distinct move icon name', () => {
    const names = new Set(
      MOVES.map((move) => move.icon).filter((icon): icon is string => Boolean(icon)),
    );
    expect(names.size).toBe(ASSET_MANIFEST.stats.moveIcons);
    expect(MOVE_ICON_BY_NAME.size).toBe(names.size);
    for (const name of names) {
      expect(MOVE_ICON_BY_NAME.has(name), name).toBe(true);
      expect(moveIconPath(name), name).toBeTruthy();
    }
  });

  it('resolves bare icon stems and unknown icons safely', () => {
    expect(moveIconPath('moveIcon_flurry')).toBe('./assets/moves/flurry.png');
    expect(moveIconPath('flurry')).toBe('./assets/moves/flurry.png');
    expect(moveIconPath(null)).toBeNull();
    expect(moveIconPath('moveIcon_notARealIcon')).toBeNull();
  });

  it('uses relative, extension-correct paths', () => {
    const paths = [
      ...Object.values(ASSET_MANIFEST.minions),
      ...Object.values(ASSET_MANIFEST.moves),
      ...Object.values(ASSET_MANIFEST.ui),
    ];
    expect(paths.length).toBeGreaterThan(0);
    for (const assetPath of paths) {
      expect(assetPath.startsWith('./assets/'), assetPath).toBe(true);
      expect(assetPath.includes('\\'), assetPath).toBe(false);
      expect(assetPath.includes(' '), assetPath).toBe(false);
      expect(assetPath.endsWith('.png'), assetPath).toBe(true);
    }
  });

  it('ships the UI textures the app expects', () => {
    const keys = [
      'pageBackdrop',
      'minionIconBackground',
      'minionIconMask',
      'minionPortraitStage',
      'minionPediaBackground',
      'movePanel',
      'skillTreePanel',
      'skillTreeNode',
      'skillTreeSpecialization',
      'skillTreePoints',
      'skillTreeOtherTree',
      'skillTreeReset',
      'emptyGemSocket',
      'filledGemSocket',
      'lockedGemSocket',
      'gemCornerHealth',
      'gemCornerEnergy',
      'gemCornerAttack',
      'gemCornerHealing',
      'gemCornerSpeed',
    ];
    for (const key of keys) expect(uiAsset(key), key).toBeTruthy();
    for (let tier = 1; tier <= GEM_TIER_COUNT; tier += 1) {
      expect(uiAsset(`gemTier${tier}Shape`), `shape ${tier}`).toBeTruthy();
      expect(uiAsset(`gemTier${tier}Mask`), `mask ${tier}`).toBeTruthy();
    }
    expect(Object.keys(UI_ASSETS).length).toBe(ASSET_MANIFEST.stats.uiTextures);
  });
});
