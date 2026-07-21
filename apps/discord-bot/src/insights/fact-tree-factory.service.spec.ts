import type {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
  MatchesService,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FactTreeFactoryService } from './fact-tree-factory.service';
import { collectLeaves, resolvePath } from './fact-tree-utils';

function makeFactory() {
  const zero = () => ({
    countAll: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    countByCompetition: vi.fn().mockResolvedValue(0),
  });
  const coaches = {
    countMatchesPlayedByCoach: vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 9 }]),
    countTeamsByCoach: vi.fn().mockResolvedValue([]),
    countCompetitionsByCoach: vi.fn().mockResolvedValue([]),
    countErasByCoach: vi.fn().mockResolvedValue([]),
    ...zero(),
  } as unknown as CoachesService;
  const teams = zero() as unknown as TeamsService;
  const matches = {
    countAll: vi.fn().mockResolvedValue(0),
    countMatchEvents: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    countMatchEventsByEra: vi.fn().mockResolvedValue(0),
    countByCompetition: vi.fn().mockResolvedValue(0),
    countMatchEventsByCompetition: vi.fn().mockResolvedValue(0),
  } as unknown as MatchesService;
  const competitions = {
    countAll: vi.fn().mockResolvedValue(0),
    countByType: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
  } as unknown as CompetitionsService;
  const leagues = zero() as unknown as LeaguesService;
  const rulesSets = zero() as unknown as RulesSetsService;
  const eras = {
    countAll: vi.fn().mockResolvedValue(0),
    getRulesSetNames: vi.fn().mockResolvedValue([]),
    listErasWithLeague: vi.fn().mockResolvedValue([]),
  } as unknown as ErasService;
  const players = zero() as unknown as PlayersService;
  const positions = zero() as unknown as PositionsService;
  const races = zero() as unknown as RacesService;
  const externalSystems = zero() as unknown as ExternalSystemsService;

  const factory = new FactTreeFactoryService(
    coaches,
    teams,
    matches,
    competitions,
    leagues,
    rulesSets,
    eras,
    players,
    positions,
    races,
    externalSystems,
  );
  return { factory, coaches };
}

describe('FactTreeFactoryService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('build() returns the fully assembled fact tree', () => {
    const { factory } = makeFactory();
    const tree = factory.build();
    // buildFactTree currently produces 39 leaves (see fact-tree.spec.ts).
    expect(collectLeaves(tree)).toHaveLength(39);
  });

  it('wires its injected services into the tree so leaves call the right service', async () => {
    const { factory, coaches } = makeFactory();
    const leaf = resolvePath(factory.build(), 'coach.toplist.matches.played');
    expect(leaf).toBeDefined();
    // resolvePath returns a FactNode; narrow to a leaf and resolve it.
    await (
      leaf as { resolve: (e?: number, c?: number) => Promise<unknown> }
    ).resolve();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(coaches.countMatchesPlayedByCoach).toHaveBeenCalled();
  });
});
