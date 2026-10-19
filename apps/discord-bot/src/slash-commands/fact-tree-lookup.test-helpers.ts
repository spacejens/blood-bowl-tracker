import type { MockProxy } from 'vitest-mock-extended';

import type { FactLeaf, FactNode } from '../insights/fact-tree.types';
import type { FactTreeUtilsService } from '../insights/fact-tree-utils.service';

/**
 * A fact tree node typed for plain property access in specs
 * (`tree.coach.toplist.matches.played`): every segment yields another
 * `FactTreeLookup`, so a spec can pick a node without parsing a path. Use
 * `asLeaf` or `asNode` to get the real node type back.
 */
export interface FactTreeLookup {
  readonly [segment: string]: FactTreeLookup;
}

/** A leaf reached through `FactTreeLookup` property access, as the `FactLeaf` it is. */
export function asLeaf(node: FactTreeLookup): FactLeaf {
  const candidate = node as unknown as Partial<FactLeaf> | undefined;
  if (typeof candidate?.resolve !== 'function') {
    throw new Error('asLeaf: the selected fact tree node is not a leaf');
  }
  return candidate as FactLeaf;
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
