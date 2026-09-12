import { Test } from '@nestjs/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildFactTree } from './fact-tree';
import { deps } from './fact-tree.test-helpers';
import type { FactLeaf } from './fact-tree.types';
import { FactTreeUtilsService } from './fact-tree-utils.service';

let factTreeUtils: FactTreeUtilsService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    providers: [FactTreeUtilsService],
  }).compile();
  factTreeUtils = moduleRef.get(FactTreeUtilsService);
});

describe('buildFactTree leaf capabilities', () => {
  it('excludes some leaves from era filtering', () => {
    const tree = buildFactTree(deps());
    const unsupported = factTreeUtils
      .collectLeaves(tree)
      .filter((leaf) => !leaf.supportsEra);
    expect(unsupported).toEqual(
      expect.arrayContaining([
        factTreeUtils.resolvePath(tree, 'eras.list'),
        factTreeUtils.resolvePath(tree, 'trophies.list'),
        factTreeUtils.resolvePath(tree, 'competitionGroups.list'),
        factTreeUtils.resolvePath(tree, 'team.toplist.eras.active'),
        factTreeUtils.resolvePath(tree, 'coach.toplist.eras.active'),
        factTreeUtils.resolvePath(tree, 'starPlayers.list'),
        factTreeUtils.resolvePath(tree, 'starPlayers.toplist.hires.total'),
        factTreeUtils.resolvePath(
          tree,
          'starPlayers.toplist.hires.distinctTeams',
        ),
      ]),
    );
    expect(unsupported).toHaveLength(8);
  });
});

describe('buildFactTree league capabilities', () => {
  it('every leaf supports league exactly when it supports era (except the list leaves)', () => {
    const tree = buildFactTree(deps());
    const leaves = factTreeUtils.collectLeaves(tree);
    // eras.list, trophies.list and competitionGroups.list are league-scopable
    // listings that are not themselves era-scopable, so they are the leaves
    // that break the otherwise-universal "league iff era" correspondence.
    // starPlayers.list, starPlayers.toplist.hires.total and
    // starPlayers.toplist.hires.distinctTeams are deliberately NOT in this
    // group: they support neither, so they satisfy the correspondence
    // trivially.
    const listLeaves = [
      factTreeUtils.resolvePath(tree, 'eras.list'),
      factTreeUtils.resolvePath(tree, 'trophies.list'),
      factTreeUtils.resolvePath(tree, 'competitionGroups.list'),
    ];
    for (const leaf of leaves) {
      if (listLeaves.includes(leaf)) {
        expect(leaf.supportsLeague).toBe(true);
        expect(leaf.supportsEra).toBe(false);
      } else {
        expect(leaf.supportsLeague).toBe(leaf.supportsEra);
      }
    }
  });
});

describe('buildFactTree competition capabilities', () => {
  it('includes only the coach trophy toplist, the team/player toplists and the stats that support competition filtering', () => {
    const tree = buildFactTree(deps());
    const supported = factTreeUtils
      .collectLeaves(tree)
      .filter((leaf) => leaf.supportsCompetition);
    expect(supported).toEqual(
      expect.arrayContaining([
        factTreeUtils.resolvePath(tree, 'coach.toplist.trophies.won'),
        factTreeUtils.resolvePath(tree, 'team.toplist.trophies.won'),
        factTreeUtils.resolvePath(tree, 'team.toplist.touchdowns.scored'),
        factTreeUtils.resolvePath(tree, 'team.toplist.completions'),
        factTreeUtils.resolvePath(tree, 'team.toplist.interceptions'),
        factTreeUtils.resolvePath(tree, 'team.toplist.deflections'),
        factTreeUtils.resolvePath(tree, 'team.toplist.casualties.caused'),
        factTreeUtils.resolvePath(tree, 'team.toplist.casualties.suffered'),
        factTreeUtils.resolvePath(tree, 'team.toplist.injuries.serious.caused'),
        factTreeUtils.resolvePath(
          tree,
          'team.toplist.injuries.serious.suffered',
        ),
        factTreeUtils.resolvePath(
          tree,
          'team.toplist.injuries.lasting.suffered',
        ),
        factTreeUtils.resolvePath(tree, 'team.toplist.deaths.caused'),
        factTreeUtils.resolvePath(tree, 'team.toplist.deaths.suffered'),
        factTreeUtils.resolvePath(tree, 'team.toplist.fouls.committed'),
        factTreeUtils.resolvePath(tree, 'team.toplist.sent_off'),
        factTreeUtils.resolvePath(tree, 'team.toplist.expensiveMistakes.total'),
        factTreeUtils.resolvePath(
          tree,
          'team.toplist.expensiveMistakes.biggest',
        ),
        factTreeUtils.resolvePath(tree, 'player.toplist.mvps'),
        factTreeUtils.resolvePath(tree, 'player.toplist.touchdowns.scored'),
        factTreeUtils.resolvePath(tree, 'player.toplist.completions'),
        factTreeUtils.resolvePath(tree, 'player.toplist.interceptions'),
        factTreeUtils.resolvePath(tree, 'player.toplist.deflections'),
        factTreeUtils.resolvePath(tree, 'player.toplist.casualties.caused'),
        factTreeUtils.resolvePath(tree, 'player.toplist.casualties.suffered'),
        factTreeUtils.resolvePath(
          tree,
          'player.toplist.injuries.serious.caused',
        ),
        factTreeUtils.resolvePath(
          tree,
          'player.toplist.injuries.serious.suffered',
        ),
        factTreeUtils.resolvePath(
          tree,
          'player.toplist.injuries.lasting.suffered',
        ),
        factTreeUtils.resolvePath(tree, 'player.toplist.deaths.caused'),
        factTreeUtils.resolvePath(tree, 'player.toplist.fouls.committed'),
        factTreeUtils.resolvePath(tree, 'player.toplist.sent_off'),
        factTreeUtils.resolvePath(tree, 'player.toplist.totalSpp'),
        factTreeUtils.resolvePath(tree, 'stats'),
        factTreeUtils.resolvePath(tree, 'date.onThisDate'),
      ]),
    );
    expect(supported).toHaveLength(33);
  });

  it('excludes the coach fouls toplist from competition filtering', () => {
    const tree = buildFactTree(deps());
    const leaf = factTreeUtils.resolvePath(
      tree,
      'coach.toplist.fouls.committed',
    ) as FactLeaf;
    expect(leaf.supportsCompetition).toBe(false);
    expect(leaf.supportsLeague).toBe(true);
    expect(leaf.supportsEra).toBe(true);
  });

  it('scopes the time-between-matches toplists to league and era but not competition', () => {
    const tree = buildFactTree(deps());
    for (const path of [
      'coach.toplist.timeBetweenMatches.longest.descending',
      'coach.toplist.timeBetweenMatches.longest.ascending',
      'coach.toplist.timeBetweenMatches.average',
    ]) {
      const leaf = factTreeUtils.resolvePath(tree, path) as FactLeaf;
      expect(leaf.supportsLeague).toBe(true);
      expect(leaf.supportsEra).toBe(true);
      expect(leaf.supportsCompetition).toBe(false);
    }
  });

  it('scopes the date matches toplists to league, era and match category but not competition', () => {
    const tree = buildFactTree(deps());
    for (const path of [
      'date.toplist.matches.ascending',
      'date.toplist.matches.descending',
    ]) {
      const leaf = factTreeUtils.resolvePath(tree, path) as FactLeaf;
      expect(leaf.supportsLeague, path).toBe(true);
      expect(leaf.supportsEra, path).toBe(true);
      expect(leaf.supportsMatchCategory, path).toBe(true);
      expect(leaf.supportsCompetition, path).toBe(false);
    }
  });

  it('forwards competitionId to an in-scope team leaf', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve({ competitionId: 30 });
    expect(d.teamToplist.resolveTouchdownsScored).toHaveBeenCalledWith({
      competitionId: 30,
    });
  });

  it('forwards competitionId to an in-scope player leaf', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.mvps',
    );
    await (leaf as FactLeaf).resolve({ competitionId: 30 });
    expect(d.playerToplist.resolveMvps).toHaveBeenCalledWith({
      competitionId: 30,
    });
  });

  it('forwards the league and era scope to a time-between-matches leaf', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'coach.toplist.timeBetweenMatches.average',
    );
    await (leaf as FactLeaf).resolve({ leagueId: 9, eraId: 20 });
    expect(
      d.coachToplist.resolveAverageTimeBetweenMatches,
    ).toHaveBeenCalledWith({ leagueId: 9, eraId: 20 });
  });
});

describe('buildFactTree match category capabilities', () => {
  it('excludes exactly the fifteen leaves that are not scoped to matches', () => {
    const tree = buildFactTree(deps());
    const unsupported = factTreeUtils
      .collectLeaves(tree)
      .filter((leaf) => !leaf.supportsMatchCategory);
    expect(unsupported).toEqual(
      expect.arrayContaining([
        factTreeUtils.resolvePath(tree, 'coach.toplist.teams'),
        factTreeUtils.resolvePath(tree, 'coach.toplist.eras.active'),
        factTreeUtils.resolvePath(tree, 'coach.toplist.trophies.won'),
        factTreeUtils.resolvePath(tree, 'team.toplist.eras.active'),
        factTreeUtils.resolvePath(tree, 'team.toplist.trophies.won'),
        factTreeUtils.resolvePath(tree, 'race.toplist.teams.descending'),
        factTreeUtils.resolvePath(tree, 'race.toplist.teams.ascending'),
        factTreeUtils.resolvePath(tree, 'position.toplist.players'),
        factTreeUtils.resolvePath(tree, 'eras.list'),
        factTreeUtils.resolvePath(tree, 'trophies.list'),
        factTreeUtils.resolvePath(tree, 'competitionGroups.list'),
        factTreeUtils.resolvePath(tree, 'starPlayers.list'),
        factTreeUtils.resolvePath(tree, 'stats'),
        factTreeUtils.resolvePath(tree, 'starPlayers.toplist.hires.total'),
        factTreeUtils.resolvePath(
          tree,
          'starPlayers.toplist.hires.distinctTeams',
        ),
      ]),
    );
    expect(unsupported).toHaveLength(15);
  });

  it('supports the match category on every other leaf', () => {
    const tree = buildFactTree(deps());
    const supported = factTreeUtils
      .collectLeaves(tree)
      .filter((leaf) => leaf.supportsMatchCategory);
    expect(supported).toHaveLength(50);
  });

  it('supports the match category on leaves that do not support a competition', () => {
    const tree = buildFactTree(deps());
    for (const path of [
      'coach.toplist.matches.played',
      'coach.toplist.matches.won',
      'coach.toplist.matches.lost',
      'coach.toplist.matches.drawn',
      'coach.toplist.competitions.played',
      'coach.toplist.fouls.committed',
      'coach.toplist.timeBetweenMatches.average',
      'team.toplist.matches.played',
      'team.toplist.matches.won',
      'team.toplist.matches.lost',
      'team.toplist.matches.drawn',
      'team.toplist.competitions.played',
      'race.toplist.matches.played',
      'race.toplist.matches.won',
      'race.toplist.matches.lost',
      'race.toplist.matches.drawn',
    ]) {
      const leaf = factTreeUtils.resolvePath(tree, path) as FactLeaf;
      expect(leaf.supportsMatchCategory, path).toBe(true);
      expect(leaf.supportsCompetition, path).toBe(false);
    }
  });

  it('forwards the match category to an in-scope leaf', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve({ category: 'season_final' });
    expect(d.teamToplist.resolveTouchdownsScored).toHaveBeenCalledWith({
      category: 'season_final',
    });
  });
});
