import {
  FAMILIES,
  MINIONS,
  MOVES,
  PACK_META,
  TREES,
  TYPE_CHART,
} from './data';
import { MINHERO_RULES, TYPES } from './rules';

/** The active game pack. */
export const MINHERO_PACK = {
  id: 'minhero-tos',
  name: 'Min Hero: Tower of Sages',
  types: TYPES,
  rules: MINHERO_RULES,
  data: {
    minions: MINIONS,
    families: FAMILIES,
    trees: TREES,
    moves: MOVES,
    typeChart: TYPE_CHART,
    meta: PACK_META,
  },
} as const;

export type MinHeroPack = typeof MINHERO_PACK;
