/** Min Hero: Tower of Sages rules and type metadata. */

import typeData from './data/types.json';

export interface TypeDef {
  id: string;
  name: string;
  color: string;
  icon: string;
  sourceName: string;
}

export const TYPES: readonly TypeDef[] = typeData;

export const TYPE_BY_ID: ReadonlyMap<string, TypeDef> = new Map(
  TYPES.map((type) => [type.id, type]),
);

/**
 * Game constants used by the core engine. Keeping these in the pack makes a
 * future game swap a data/rules change rather than a UI rewrite.
 */
export const MINHERO_RULES = {
  teamSize: 5,
  maxLevel: 60,
  skillPointsAtMax: 17,
  treeColumns: 3,
  treeRows: 4,
  rowPointRequirement: 3,
  secondaryTreeUnlockAt: 11,
  weak: { num: 3, den: 2 },
  resist: { num: 2, den: 3 },
  stab: { num: 11, den: 10 },
} as const;
