/**
 * Reverse lookups derived from the data pack: which minions can learn a move,
 * and through which part of their kit.
 *
 * Built once at module load (102 minions × 3 trees), so views can ask for
 * learners without re-scanning the roster on every render.
 */

import { MINIONS, MOVE_BY_ID, TREE_BY_ID } from '../packs/minhero/data';
import type { MinionData } from '../packs/minhero/data';

export type LearnSourceKind = 'starting' | 'specialization' | 'tree';

export interface LearnSource {
  kind: LearnSourceKind;
  /** Player-facing label, e.g. "Starting move" or the tree name. */
  label: string;
  treeId?: string;
}

export interface MoveLearner {
  minionId: string;
  sources: LearnSource[];
}

function addSource(
  index: Map<string, MoveLearner[]>,
  moveId: string,
  minion: MinionData,
  source: LearnSource,
): void {
  if (!MOVE_BY_ID.has(moveId)) return;
  let learners = index.get(moveId);
  if (!learners) {
    learners = [];
    index.set(moveId, learners);
  }
  let entry = learners.find((learner) => learner.minionId === minion.id);
  if (!entry) {
    entry = { minionId: minion.id, sources: [] };
    learners.push(entry);
  }
  if (!entry.sources.some((known) => known.label === source.label)) {
    entry.sources.push(source);
  }
}

function buildLearnerIndex(): Map<string, MoveLearner[]> {
  const index = new Map<string, MoveLearner[]>();
  // MINIONS is in dex order, so each learner list stays dex-sorted.
  for (const minion of MINIONS) {
    for (const moveId of minion.startingMoves) {
      addSource(index, moveId, minion, { kind: 'starting', label: 'Starting move' });
    }
    minion.specializationMoves.forEach((moveId, treeIndex) => {
      const tree = TREE_BY_ID.get(minion.treeIds[treeIndex] ?? '');
      addSource(index, moveId, minion, {
        kind: 'specialization',
        label: tree ? `Specialization · ${tree.name}` : `Specialization ${treeIndex + 1}`,
        treeId: tree?.id,
      });
    });
    for (const treeId of minion.treeIds) {
      const tree = TREE_BY_ID.get(treeId);
      if (!tree) continue;
      for (const node of tree.nodes) {
        for (const moveId of node.moves) {
          addSource(index, moveId, minion, { kind: 'tree', label: tree.name, treeId });
        }
      }
    }
  }
  return index;
}

const LEARNER_INDEX: ReadonlyMap<string, readonly MoveLearner[]> = buildLearnerIndex();

/** Every minion that can learn `moveId`, with where the move appears in its kit. */
export function learnersForMove(moveId: string): readonly MoveLearner[] {
  return LEARNER_INDEX.get(moveId) ?? [];
}

export function learnerCount(moveId: string): number {
  return learnersForMove(moveId).length;
}
