import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { FactTreeFactoryService } from './fact-tree-factory.service';
import { FactTreeUtilsService } from './fact-tree-utils.service';
import { CoachToplistService } from './facts/coach-toplist.service';
import { ErasListService } from './facts/eras-list.service';
import { ExpensiveMistakesToplistService } from './facts/expensive-mistakes-toplist.service';
import { PlayerToplistService } from './facts/player-toplist.service';
import { RaceToplistService } from './facts/race-toplist.service';
import { StatsSummaryFactsService } from './facts/stats-summary.service';
import { TeamToplistService } from './facts/team-toplist.service';

describe('FactTreeFactoryService', () => {
  let factory: FactTreeFactoryService;
  let factTreeUtils: FactTreeUtilsService;
  let coachToplist: MockProxy<CoachToplistService>;
  let teamToplist: MockProxy<TeamToplistService>;
  let playerToplist: MockProxy<PlayerToplistService>;
  let raceToplist: MockProxy<RaceToplistService>;
  let expensiveMistakes: MockProxy<ExpensiveMistakesToplistService>;
  let erasList: MockProxy<ErasListService>;
  let statsSummary: MockProxy<StatsSummaryFactsService>;

  beforeEach(async () => {
    coachToplist = mock<CoachToplistService>();
    teamToplist = mock<TeamToplistService>();
    playerToplist = mock<PlayerToplistService>();
    raceToplist = mock<RaceToplistService>();
    expensiveMistakes = mock<ExpensiveMistakesToplistService>();
    erasList = mock<ErasListService>();
    statsSummary = mock<StatsSummaryFactsService>();

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
        { provide: StatsSummaryFactsService, useValue: statsSummary },
      ],
    }).compile();
    factory = moduleRef.get(FactTreeFactoryService);
    factTreeUtils = moduleRef.get(FactTreeUtilsService);
  });

  it('build() returns the fully assembled fact tree', () => {
    const tree = factory.build();
    // buildFactTree currently produces 43 leaves (see fact-tree.spec.ts).
    expect(factTreeUtils.collectLeaves(tree)).toHaveLength(43);
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
});
