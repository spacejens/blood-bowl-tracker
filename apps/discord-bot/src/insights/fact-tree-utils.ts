import type { FactScope } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

export interface FactLeaf {
  supportsLeague: boolean;
  supportsEra: boolean;
  supportsCompetition: boolean;
  resolve: (scope: FactScope) => Promise<string | InteractionReplyOptions>;
}
export type FactNode = FactLeaf | { [segment: string]: FactNode };

function isLeaf(node: FactNode): node is FactLeaf {
  return typeof (node as FactLeaf).resolve === 'function';
}

export function resolvePath(
  tree: FactNode,
  path: string,
): FactNode | undefined {
  const segments = path.split('.').filter((segment) => segment.length > 0);
  let current: FactNode = tree;
  for (const segment of segments) {
    if (isLeaf(current)) {
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

export function collectLeaves(node: FactNode): FactLeaf[] {
  if (isLeaf(node)) {
    return [node];
  }
  return Object.values(node).flatMap(collectLeaves);
}

export function nextSegmentCompletions(
  tree: FactNode,
  partialPath: string,
): string[] {
  const segments = partialPath.split('.');
  const partialLast = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);
  const parentPath = parentSegments.join('.');
  const parent = parentPath.length === 0 ? tree : resolvePath(tree, parentPath);
  if (parent === undefined || isLeaf(parent)) {
    return [];
  }
  const prefix = parentSegments.length === 0 ? '' : `${parentPath}.`;
  return Object.keys(parent)
    .filter((key) => key.startsWith(partialLast))
    .map((key) => `${prefix}${key}`);
}
