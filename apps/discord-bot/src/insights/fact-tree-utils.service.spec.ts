import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FactLeaf, FactNode } from './fact-tree.types';
import { FactTreeUtilsService } from './fact-tree-utils.service';

const leafA: FactLeaf = {
  supportsLeague: false,
  supportsEra: false,
  supportsCompetition: false,
  supportsMatchCategory: false,
  resolve: () => Promise.resolve('A'),
};
const leafB: FactLeaf = {
  supportsLeague: false,
  supportsEra: false,
  supportsCompetition: false,
  supportsMatchCategory: false,
  resolve: () => Promise.resolve('B'),
};
const leafC: FactLeaf = {
  supportsLeague: false,
  supportsEra: false,
  supportsCompetition: false,
  supportsMatchCategory: false,
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

describe('FactTreeUtilsService', () => {
  let service: FactTreeUtilsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [FactTreeUtilsService],
    }).compile();
    service = moduleRef.get(FactTreeUtilsService);
  });

  describe('resolvePath', () => {
    it('resolves an exact leaf path to the leaf resolver', () => {
      expect(service.resolvePath(tree, 'coach.toplist.matches.played')).toBe(
        leafA,
      );
    });

    it('resolves a branch path to the branch node', () => {
      expect(service.resolvePath(tree, 'coach.toplist')).toBe(
        (tree as { coach: { toplist: FactNode } }).coach.toplist,
      );
    });

    it('returns undefined when a segment does not match', () => {
      expect(service.resolvePath(tree, 'coach.nope')).toBeUndefined();
    });

    it('returns undefined when descending past a leaf', () => {
      expect(
        service.resolvePath(tree, 'coach.toplist.teams.extra'),
      ).toBeUndefined();
    });

    it('returns the whole tree for an empty path', () => {
      expect(service.resolvePath(tree, '')).toBe(tree);
    });
  });

  describe('collectLeaves', () => {
    it('flattens a branch into all resolvers beneath it', () => {
      expect(service.collectLeaves(tree)).toEqual([leafA, leafB, leafC]);
    });

    it('flattens a single leaf into itself', () => {
      expect(service.collectLeaves(leafA)).toEqual([leafA]);
    });

    it('flattens a sub-branch', () => {
      expect(
        service.collectLeaves(service.resolvePath(tree, 'coach') as FactNode),
      ).toEqual([leafA, leafB]);
    });
  });

  describe('nextSegmentCompletions', () => {
    it('returns top-level segments for an empty partial path', () => {
      expect(service.nextSegmentCompletions(tree, '')).toEqual([
        'coach',
        'team',
      ]);
    });

    it('completes a partial top-level segment', () => {
      expect(service.nextSegmentCompletions(tree, 'co')).toEqual(['coach']);
    });

    it('returns the full completed top-level path when it matches a branch', () => {
      expect(service.nextSegmentCompletions(tree, 'coach')).toEqual(['coach']);
    });

    it('returns deeper segments after a trailing dot', () => {
      expect(service.nextSegmentCompletions(tree, 'coach.')).toEqual([
        'coach.toplist',
      ]);
    });

    it('filters deeper segments by the partial final segment', () => {
      expect(service.nextSegmentCompletions(tree, 'coach.toplist.m')).toEqual([
        'coach.toplist.matches',
      ]);
    });

    it('returns nothing when the parent path is unknown', () => {
      expect(service.nextSegmentCompletions(tree, 'nope.deeper')).toEqual([]);
    });

    it('returns nothing when the parent path is a leaf', () => {
      expect(
        service.nextSegmentCompletions(tree, 'coach.toplist.teams.anything'),
      ).toEqual([]);
    });
  });
});
