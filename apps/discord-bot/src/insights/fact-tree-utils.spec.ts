import { describe, expect, it } from 'vitest';

import type { FactLeaf, FactNode } from './fact-tree-utils';
import {
  collectLeaves,
  nextSegmentCompletions,
  resolvePath,
} from './fact-tree-utils';

const leafA: FactLeaf = {
  supportsLeague: false,
  supportsEra: false,
  supportsCompetition: false,
  resolve: () => Promise.resolve('A'),
};
const leafB: FactLeaf = {
  supportsLeague: false,
  supportsEra: false,
  supportsCompetition: false,
  resolve: () => Promise.resolve('B'),
};
const leafC: FactLeaf = {
  supportsLeague: false,
  supportsEra: false,
  supportsCompetition: false,
  resolve: () => Promise.resolve('C'),
};

const tree: FactNode = {
  coach: {
    toplist: {
      matches: { played: leafA },
      teams: leafB,
    },
  },
  team: {
    toplist: { matches: { played: leafC } },
  },
};

describe('resolvePath', () => {
  it('resolves an exact leaf path to the leaf resolver', () => {
    expect(resolvePath(tree, 'coach.toplist.matches.played')).toBe(leafA);
  });

  it('resolves a branch path to the branch node', () => {
    expect(resolvePath(tree, 'coach.toplist')).toBe(
      (tree as { coach: { toplist: FactNode } }).coach.toplist,
    );
  });

  it('returns undefined when a segment does not match', () => {
    expect(resolvePath(tree, 'coach.nope')).toBeUndefined();
  });

  it('returns undefined when descending past a leaf', () => {
    expect(resolvePath(tree, 'coach.toplist.teams.extra')).toBeUndefined();
  });

  it('returns the whole tree for an empty path', () => {
    expect(resolvePath(tree, '')).toBe(tree);
  });
});

describe('collectLeaves', () => {
  it('flattens a branch into all resolvers beneath it', () => {
    expect(collectLeaves(tree)).toEqual([leafA, leafB, leafC]);
  });

  it('flattens a single leaf into itself', () => {
    expect(collectLeaves(leafA)).toEqual([leafA]);
  });

  it('flattens a sub-branch', () => {
    expect(collectLeaves(resolvePath(tree, 'coach') as FactNode)).toEqual([
      leafA,
      leafB,
    ]);
  });
});

describe('nextSegmentCompletions', () => {
  it('returns top-level segments for an empty partial path', () => {
    expect(nextSegmentCompletions(tree, '')).toEqual(['coach', 'team']);
  });

  it('completes a partial top-level segment', () => {
    expect(nextSegmentCompletions(tree, 'co')).toEqual(['coach']);
  });

  it('returns the full completed top-level path when it matches a branch', () => {
    expect(nextSegmentCompletions(tree, 'coach')).toEqual(['coach']);
  });

  it('returns deeper segments after a trailing dot', () => {
    expect(nextSegmentCompletions(tree, 'coach.')).toEqual(['coach.toplist']);
  });

  it('filters deeper segments by the partial final segment', () => {
    expect(nextSegmentCompletions(tree, 'coach.toplist.m')).toEqual([
      'coach.toplist.matches',
    ]);
  });

  it('returns nothing when the parent path is unknown', () => {
    expect(nextSegmentCompletions(tree, 'nope.deeper')).toEqual([]);
  });

  it('returns nothing when the parent path is a leaf', () => {
    expect(
      nextSegmentCompletions(tree, 'coach.toplist.teams.anything'),
    ).toEqual([]);
  });
});
