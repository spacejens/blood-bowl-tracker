import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { FactTreeFactoryService } from './fact-tree-factory.service';
import { FactTreeUtilsService } from './fact-tree-utils.service';
import { CoachToplistService } from './facts/coach-toplist.service';
import { CompetitionGroupsListService } from './facts/competition-groups-list.service';
import { ErasListService } from './facts/eras-list.service';
import { ExpensiveMistakesToplistService } from './facts/expensive-mistakes-toplist.service';
import { PlayerToplistService } from './facts/player-toplist.service';
import { RaceToplistService } from './facts/race-toplist.service';
import { StarPlayersListService } from './facts/star-players-list.service';
import { StatsSummaryFactsService } from './facts/stats-summary.service';
import { TeamToplistService } from './facts/team-toplist.service';
import { TrophiesListService } from './facts/trophies-list.service';

describe('FactTreeFactoryService', () => {
  let factory: FactTreeFactoryService;
  let factTreeUtils: FactTreeUtilsService;
  let coachToplist: MockProxy<CoachToplistService>;
  let teamToplist: MockProxy<TeamToplistService>;
  let playerToplist: MockProxy<PlayerToplistService>;
  let raceToplist: MockProxy<RaceToplistService>;
  let expensiveMistakes: MockProxy<ExpensiveMistakesToplistService>;
  let erasList: MockProxy<ErasListService>;
  let competitionGroupsList: MockProxy<CompetitionGroupsListService>;
  let statsSummary: MockProxy<StatsSummaryFactsService>;
  let starPlayersList: MockProxy<StarPlayersListService>;
  let trophiesList: MockProxy<TrophiesListService>;

  beforeEach(async () => {
    coachToplist = mock<CoachToplistService>();
    teamToplist = mock<TeamToplistService>();
    playerToplist = mock<PlayerToplistService>();
    raceToplist = mock<RaceToplistService>();
    expensiveMistakes = mock<ExpensiveMistakesToplistService>();
    erasList = mock<ErasListService>();
    competitionGroupsList = mock<CompetitionGroupsListService>();
    statsSummary = mock<StatsSummaryFactsService>();
    starPlayersList = mock<StarPlayersListService>();
    trophiesList = mock<TrophiesListService>();

    coachToplist.resolveMatchesPlayed.mockResolvedValue(
      'coach matches played toplist',
    );
    coachToplist.resolveTeams.mockResolvedValue('coach teams toplist');
    coachToplist.resolveCompetitionsPlayed.mockResolvedValue(
      'coach competitions played toplist',
    );
    coachToplist.resolveErasActive.mockResolvedValue(
      'coach eras active toplist',
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        FactTreeFactoryService,
        FactTreeUtilsService,
        { provide: CoachToplistService, useValue: coachToplist },
        { provide: TeamToplistService, useValue: teamToplist },
        { provide: PlayerToplistService, useValue: playerToplist },
        { provide: RaceToplistService, useValue: raceToplist },
        {
          provide: ExpensiveMistakesToplistService,
          useValue: expensiveMistakes,
        },
        { provide: ErasListService, useValue: erasList },
        {
          provide: CompetitionGroupsListService,
          useValue: competitionGroupsList,
        },
        { provide: StatsSummaryFactsService, useValue: statsSummary },
        { provide: StarPlayersListService, useValue: starPlayersList },
        { provide: TrophiesListService, useValue: trophiesList },
      ],
    }).compile();
    factory = moduleRef.get(FactTreeFactoryService);
    factTreeUtils = moduleRef.get(FactTreeUtilsService);
  });

  it('build() returns the fully assembled fact tree', () => {
    const tree = factory.build();
    // buildFactTree currently produces 57 leaves (see fact-tree.spec.ts).
    expect(factTreeUtils.collectLeaves(tree)).toHaveLength(57);
  });

  it('wires its injected services into the tree so leaves call the right service', async () => {
    const leaf = factTreeUtils.resolvePath(
      factory.build(),
      'coach.toplist.matches.played',
    );
    expect(leaf).toBeDefined();
    // resolvePath returns a FactNode; narrow to a leaf and resolve it.
    await (
      leaf as { resolve: (e?: number, c?: number) => Promise<unknown> }
    ).resolve();
    expect(coachToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });

  it('threads StarPlayersListService into the tree so starPlayers.list calls it', async () => {
    const leaf = factTreeUtils.resolvePath(factory.build(), 'starPlayers.list');
    expect(leaf).toBeDefined();
    await (
      leaf as { resolve: (e?: number, c?: number) => Promise<unknown> }
    ).resolve();
    expect(starPlayersList.resolve).toHaveBeenCalled();
  });
});
