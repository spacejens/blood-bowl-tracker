import { Injectable } from '@nestjs/common';

import type { FactLeaf, FactNode } from './fact-tree.types';

@Injectable()
export class FactTreeUtilsService {
  private isLeaf(node: FactNode): node is FactLeaf {
    return typeof (node as FactLeaf).resolve === 'function';
  }

  resolvePath(tree: FactNode, path: string): FactNode | undefined {
    const segments = path.split('.').filter((segment) => segment.length > 0);
    let current: FactNode = tree;
    for (const segment of segments) {
      if (this.isLeaf(current)) {
        return undefined;
      }
      const next = current[segment];
      if (next === undefined) {
        return undefined;
      }
      current = next;
    }
    return current;
  }

  collectLeaves(node: FactNode): FactLeaf[] {
    if (this.isLeaf(node)) {
      return [node];
    }
    return Object.values(node).flatMap((child) => this.collectLeaves(child));
  }

  nextSegmentCompletions(tree: FactNode, partialPath: string): string[] {
    const segments = partialPath.split('.');
    const partialLast = segments[segments.length - 1];
    const parentSegments = segments.slice(0, -1);
    const parentPath = parentSegments.join('.');
    const parent =
      parentPath.length === 0 ? tree : this.resolvePath(tree, parentPath);
    if (parent === undefined || this.isLeaf(parent)) {
      return [];
    }
    const prefix = parentSegments.length === 0 ? '' : `${parentPath}.`;
    return Object.keys(parent)
      .filter((key) => key.startsWith(partialLast))
      .map((key) => `${prefix}${key}`);
  }
}
