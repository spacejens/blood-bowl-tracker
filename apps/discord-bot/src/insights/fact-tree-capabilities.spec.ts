import { Test } from '@nestjs/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildFactTree } from './fact-tree';
import { stubFactTreeDeps } from './fact-tree.test-helpers';
import type { FactLeaf } from './fact-tree.types';
import { FactTreeNavigationService } from './fact-tree-navigation.service';

let factTreeNavigation: FactTreeNavigationService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    providers: [FactTreeNavigationService],
  }).compile();
  factTreeNavigation = moduleRef.get(FactTreeNavigationService);
});

/** Every team per-match average leaf: league, era and category, no competition. */
const TEAM_AVERAGE_PATHS = [
  'team.toplist.touchdowns.average.scored.descending',
  'team.toplist.touchdowns.average.scored.ascending',
  'team.toplist.touchdowns.average.conceded.descending',
  'team.toplist.touchdowns.average.conceded.ascending',
  'team.toplist.casualties.average.caused.descending',
  'team.toplist.casualties.average.caused.ascending',
  'team.toplist.casualties.average.suffered.descending',
  'team.toplist.casualties.average.suffered.ascending',
  'team.toplist.injuries.serious.average.caused.descending',
  'team.toplist.injuries.serious.average.caused.ascending',
  'team.toplist.injuries.serious.average.suffered.descending',
  'team.toplist.injuries.serious.average.suffered.ascending',
  'team.toplist.injuries.lasting.average.suffered.descending',
  'team.toplist.injuries.lasting.average.suffered.ascending',
] as const;

describe('buildFactTree leaf capabilities', () => {
  it('excludes some leaves from era filtering', () => {
    const tree = buildFactTree(stubFactTreeDeps());
    const unsupported = factTreeNavigation
      .collectLeaves(tree)
      .filter((leaf) => !leaf.supportsEra);
    expect(unsupported).toEqual(
      expect.arrayContaining([
        factTreeNavigation.resolvePath(tree, 'eras.list'),
        factTreeNavigation.resolvePath(tree, 'trophies.list'),
        factTreeNavigation.resolvePath(tree, 'competitionGroups.list'),
        factTreeNavigation.resolvePath(tree, 'team.toplist.eras.active'),
        factTreeNavigation.resolvePath(tree, 'coach.toplist.eras.active'),
        factTreeNavigation.resolvePath(tree, 'starPlayers.list'),
        factTreeNavigation.resolvePath(tree, 'starPlayers.toplist.hires.total'),
        factTreeNavigation.resolvePath(
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
    const tree = buildFactTree(stubFactTreeDeps());
    const leaves = factTreeNavigation.collectLeaves(tree);
    // eras.list, trophies.list and competitionGroups.list are league-scopable
    // listings that are not themselves era-scopable, so they are the leaves
    // that break the otherwise-universal "league iff era" correspondence.
    // starPlayers.list, starPlayers.toplist.hires.total and
    // starPlayers.toplist.hires.distinctTeams are deliberately NOT in this
    // group: they support neither, so they satisfy the correspondence
    // trivially.
    const listLeaves = [
      factTreeNavigation.resolvePath(tree, 'eras.list'),
      factTreeNavigation.resolvePath(tree, 'trophies.list'),
      factTreeNavigation.resolvePath(tree, 'competitionGroups.list'),
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
    const tree = buildFactTree(stubFactTreeDeps());
    const supported = factTreeNavigation
      .collectLeaves(tree)
      .filter((leaf) => leaf.supportsCompetition);
    expect(supported).toEqual(
      expect.arrayContaining([
        factTreeNavigation.resolvePath(tree, 'coach.toplist.trophies.won'),
        factTreeNavigation.resolvePath(tree, 'team.toplist.trophies.won'),
        factTreeNavigation.resolvePath(tree, 'team.toplist.touchdowns.scored'),
        factTreeNavigation.resolvePath(tree, 'team.toplist.completions'),
        factTreeNavigation.resolvePath(tree, 'team.toplist.interceptions'),
        factTreeNavigation.resolvePath(tree, 'team.toplist.deflections'),
        factTreeNavigation.resolvePath(tree, 'team.toplist.casualties.caused'),
        factTreeNavigation.resolvePath(
          tree,
          'team.toplist.casualties.suffered',
        ),
        factTreeNavigation.resolvePath(
          tree,
          'team.toplist.injuries.serious.caused',
        ),
        factTreeNavigation.resolvePath(
          tree,
          'team.toplist.injuries.serious.suffered',
        ),
        factTreeNavigation.resolvePath(
          tree,
          'team.toplist.injuries.lasting.suffered',
        ),
        factTreeNavigation.resolvePath(tree, 'team.toplist.deaths.caused'),
        factTreeNavigation.resolvePath(tree, 'team.toplist.deaths.suffered'),
        factTreeNavigation.resolvePath(tree, 'team.toplist.fouls.committed'),
        factTreeNavigation.resolvePath(tree, 'team.toplist.sent_off'),
        factTreeNavigation.resolvePath(
          tree,
          'team.toplist.expensiveMistakes.total',
        ),
        factTreeNavigation.resolvePath(
          tree,
          'team.toplist.expensiveMistakes.biggest',
        ),
        factTreeNavigation.resolvePath(tree, 'player.toplist.mvps'),
        factTreeNavigation.resolvePath(
          tree,
          'player.toplist.touchdowns.scored',
        ),
        factTreeNavigation.resolvePath(tree, 'player.toplist.completions'),
        factTreeNavigation.resolvePath(tree, 'player.toplist.interceptions'),
        factTreeNavigation.resolvePath(tree, 'player.toplist.deflections'),
        factTreeNavigation.resolvePath(
          tree,
          'player.toplist.casualties.caused',
        ),
        factTreeNavigation.resolvePath(
          tree,
          'player.toplist.casualties.suffered',
        ),
        factTreeNavigation.resolvePath(
          tree,
          'player.toplist.injuries.serious.caused',
        ),
        factTreeNavigation.resolvePath(
          tree,
          'player.toplist.injuries.serious.suffered',
        ),
        factTreeNavigation.resolvePath(
          tree,
          'player.toplist.injuries.lasting.suffered',
        ),
        factTreeNavigation.resolvePath(tree, 'player.toplist.deaths.caused'),
        factTreeNavigation.resolvePath(tree, 'player.toplist.fouls.committed'),
        factTreeNavigation.resolvePath(tree, 'player.toplist.sent_off'),
        factTreeNavigation.resolvePath(tree, 'player.toplist.totalSpp'),
        factTreeNavigation.resolvePath(tree, 'stats'),
        factTreeNavigation.resolvePath(tree, 'date.onThisDate'),
      ]),
    );
    expect(supported).toHaveLength(33);
  });

  it('excludes the coach fouls toplist from competition filtering', () => {
    const tree = buildFactTree(stubFactTreeDeps());
    const leaf = factTreeNavigation.resolvePath(
      tree,
      'coach.toplist.fouls.committed',
    ) as FactLeaf;
    expect(leaf.supportsCompetition).toBe(false);
    expect(leaf.supportsLeague).toBe(true);
    expect(leaf.supportsEra).toBe(true);
  });

  it('scopes the time-between-matches toplists to league and era but not competition', () => {
    const tree = buildFactTree(stubFactTreeDeps());
    for (const path of [
      'coach.toplist.timeBetweenMatches.longest.descending',
      'coach.toplist.timeBetweenMatches.longest.ascending',
      'coach.toplist.timeBetweenMatches.average',
    ]) {
      const leaf = factTreeNavigation.resolvePath(tree, path) as FactLeaf;
      expect(leaf.supportsLeague).toBe(true);
      expect(leaf.supportsEra).toBe(true);
      expect(leaf.supportsCompetition).toBe(false);
    }
  });

  it('scopes the team per-match averages to league and era but not competition', () => {
    const tree = buildFactTree(stubFactTreeDeps());
    for (const path of TEAM_AVERAGE_PATHS) {
      const leaf = factTreeNavigation.resolvePath(tree, path) as FactLeaf;
      expect(leaf.supportsLeague, path).toBe(true);
      expect(leaf.supportsEra, path).toBe(true);
      expect(leaf.supportsCompetition, path).toBe(false);
    }
  });

  it('forwards competitionId to an in-scope team leaf', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve({ competitionId: 30 });
    expect(d.teamToplist.resolveTouchdownsScored).toHaveBeenCalledWith({
      competitionId: 30,
    });
  });

  it('forwards competitionId to an in-scope player leaf', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'player.toplist.mvps',
    );
    await (leaf as FactLeaf).resolve({ competitionId: 30 });
    expect(d.playerToplist.resolveMvps).toHaveBeenCalledWith({
      competitionId: 30,
    });
  });

  it('forwards the league and era scope to a time-between-matches leaf', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'coach.toplist.timeBetweenMatches.average',
    );
    await (leaf as FactLeaf).resolve({ leagueId: 9, eraId: 20 });
    expect(
      d.coachToplist.resolveAverageTimeBetweenMatches,
    ).toHaveBeenCalledWith({ leagueId: 9, eraId: 20 });
  });

  it('scopes the skill toplists to league and era but not competition', () => {
    const tree = buildFactTree(stubFactTreeDeps());
    for (const path of [
      'skill.toplist.players.any',
      'skill.toplist.players.advancement.any',
      'skill.toplist.players.advancement.chosen',
      'skill.toplist.players.advancement.random',
    ]) {
      const leaf = factTreeNavigation.resolvePath(tree, path) as FactLeaf;
      expect(leaf.supportsLeague).toBe(true);
      expect(leaf.supportsEra).toBe(true);
      expect(leaf.supportsCompetition).toBe(false);
    }
  });
});

describe('buildFactTree match category capabilities', () => {
  it('excludes exactly the nineteen leaves that are not scoped to matches', () => {
    const tree = buildFactTree(stubFactTreeDeps());
    const unsupported = factTreeNavigation
      .collectLeaves(tree)
      .filter((leaf) => !leaf.supportsMatchCategory);
    expect(unsupported).toEqual(
      expect.arrayContaining([
        factTreeNavigation.resolvePath(tree, 'coach.toplist.teams'),
        factTreeNavigation.resolvePath(tree, 'coach.toplist.eras.active'),
        factTreeNavigation.resolvePath(tree, 'coach.toplist.trophies.won'),
        factTreeNavigation.resolvePath(tree, 'team.toplist.eras.active'),
        factTreeNavigation.resolvePath(tree, 'team.toplist.trophies.won'),
        factTreeNavigation.resolvePath(tree, 'race.toplist.teams.descending'),
        factTreeNavigation.resolvePath(tree, 'race.toplist.teams.ascending'),
        factTreeNavigation.resolvePath(tree, 'position.toplist.players'),
        factTreeNavigation.resolvePath(tree, 'skill.toplist.players.any'),
        factTreeNavigation.resolvePath(
          tree,
          'skill.toplist.players.advancement.any',
        ),
        factTreeNavigation.resolvePath(
          tree,
          'skill.toplist.players.advancement.chosen',
        ),
        factTreeNavigation.resolvePath(
          tree,
          'skill.toplist.players.advancement.random',
        ),
        factTreeNavigation.resolvePath(tree, 'eras.list'),
        factTreeNavigation.resolvePath(tree, 'trophies.list'),
        factTreeNavigation.resolvePath(tree, 'competitionGroups.list'),
        factTreeNavigation.resolvePath(tree, 'starPlayers.list'),
        factTreeNavigation.resolvePath(tree, 'stats'),
        factTreeNavigation.resolvePath(tree, 'starPlayers.toplist.hires.total'),
        factTreeNavigation.resolvePath(
          tree,
          'starPlayers.toplist.hires.distinctTeams',
        ),
      ]),
    );
    expect(unsupported).toHaveLength(19);
  });

  it('supports the match category on every other leaf', () => {
    const tree = buildFactTree(stubFactTreeDeps());
    const supported = factTreeNavigation
      .collectLeaves(tree)
      .filter((leaf) => leaf.supportsMatchCategory);
    expect(supported).toHaveLength(64);
  });

  it('supports the match category on leaves that do not support a competition', () => {
    const tree = buildFactTree(stubFactTreeDeps());
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
      ...TEAM_AVERAGE_PATHS,
      'race.toplist.matches.played',
      'race.toplist.matches.won',
      'race.toplist.matches.lost',
      'race.toplist.matches.drawn',
    ]) {
      const leaf = factTreeNavigation.resolvePath(tree, path) as FactLeaf;
      expect(leaf.supportsMatchCategory, path).toBe(true);
      expect(leaf.supportsCompetition, path).toBe(false);
    }
  });

  it('forwards the match category to an in-scope leaf', async () => {
    const d = stubFactTreeDeps();
    const leaf = factTreeNavigation.resolvePath(
      buildFactTree(d),
      'team.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve({ category: 'season_final' });
    expect(d.teamToplist.resolveTouchdownsScored).toHaveBeenCalledWith({
      category: 'season_final',
    });
  });
});
