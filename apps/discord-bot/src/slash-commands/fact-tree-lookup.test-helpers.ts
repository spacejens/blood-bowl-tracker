import type { MockProxy } from 'vitest-mock-extended';

import type { FactLeaf, FactNode } from '../insights/fact-tree.types';
import type { FactTreeUtilsService } from '../insights/fact-tree-utils.service';

/**
 * The real built fact tree, typed for plain property access in specs
 * (`tree.coach.toplist.matches.played`). It is the same object the service
 * receives as FACT_TREE, cast so a spec can pick a canned node without
 * parsing a path.
 */
export interface FactTreeLookup {
  readonly [segment: string]: FactTreeLookup;
}

/** A leaf reached through `FactTreeLookup` property access, as the `FactLeaf` it is. */
export function asLeaf(node: FactTreeLookup): FactLeaf {
  return node as unknown as FactLeaf;
}

/** A branch reached through `FactTreeLookup` property access, as the `FactNode` it is. */
export function asNode(node: FactTreeLookup): FactNode {
  return node;
}

/**
 * Stubs FactTreeUtilsService for a category naming exactly one leaf:
 * `resolvePath` returns that leaf and `collectLeaves` returns `[leaf]`.
 * Canned values only; what the real service computes for a path is covered by
 * fact-tree-utils.service.spec.ts.
 */
export function stubLeafCategory(
  factTreeUtils: MockProxy<FactTreeUtilsService>,
  leaf: FactLeaf,
): void {
  factTreeUtils.resolvePath.mockReturnValue(leaf);
  factTreeUtils.collectLeaves.mockReturnValue([leaf]);
}
