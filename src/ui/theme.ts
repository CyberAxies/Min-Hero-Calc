import { uiAsset } from '../packs/minhero/assets';
import { cssUrl } from './dom';

/**
 * Theme registry.
 *
 * 1.0 ships a single "sage" theme that follows the game's slate-and-gold menu
 * palette. The 1.1 settings screen only needs to persist one of these names in
 * `AppState.settings` and call `applyTheme()` on store updates; palettes live in
 * `styles/tokens.css` under `:root[data-theme='…']`.
 */
export type ThemeName = 'sage';

export interface ThemeDefinition {
  label: string;
  /** Art-manifest keys exposed to CSS as `--texture-<slot>`. */
  textures: Record<string, string>;
}

export const THEMES: Record<ThemeName, ThemeDefinition> = {
  sage: {
    label: 'Sage',
    textures: {
      page: 'pageBackdrop',
      panel: 'skillTreePanel',
      node: 'skillTreeNode',
      spec: 'skillTreeSpecialization',
      points: 'skillTreePoints',
      reset: 'skillTreeReset',
    },
  },
};

export const DEFAULT_THEME: ThemeName = 'sage';

/**
 * Applies a theme to `<html>`: sets `data-theme` for palette overrides and
 * injects the texture URLs from the generated art manifest, so CSS never has to
 * hard-code a `./assets/...` path.
 */
export function applyTheme(name: ThemeName = DEFAULT_THEME): void {
  const theme = THEMES[name];
  const root = document.documentElement;
  root.dataset['theme'] = name;
  for (const [slot, assetKey] of Object.entries(theme.textures)) {
    root.style.setProperty(`--texture-${slot}`, cssUrl(uiAsset(assetKey)));
  }
}
