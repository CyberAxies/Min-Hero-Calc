/**
 * Which skill tree the planner is showing for a minion.
 *
 * The planner re-renders on every point spent, so the active tab has to live
 * outside the component. Session-only: a reload starts on the specialization's
 * tree again.
 */

const tabs = new Map<string, number>();

export function treeTabFor(minionId: string, fallback: number): number {
  return tabs.get(minionId) ?? (fallback >= 0 ? fallback : 0);
}

export function setTreeTab(minionId: string, index: number): void {
  tabs.set(minionId, index);
}
