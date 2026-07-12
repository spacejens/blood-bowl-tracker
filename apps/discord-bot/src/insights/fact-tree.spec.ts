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
import { describe, expect, it, vi } from 'vitest';

import { buildFactTree } from './fact-tree';
import { collectLeaves, resolvePath } from './fact-tree-utils';

function deps() {
  const zero = () => ({ countAll: vi.fn().mockResolvedValue(0) });
  return {
    coaches: {
      countMatchesPlayedByCoach: vi.fn().mockResolvedValue([]),
      countTeamsByCoach: vi.fn().mockResolvedValue([]),
      countAll: vi.fn().mockResolvedValue(0),
    } as unknown as CoachesService,
    teams: {
      countMatchesPlayedByTeam: vi.fn().mockResolvedValue([]),
      countAll: vi.fn().mockResolvedValue(0),
    } as unknown as TeamsService,
    matches: {
      countAll: vi.fn().mockResolvedValue(0),
      countMatchEvents: vi.fn().mockResolvedValue(0),
    } as unknown as MatchesService,
    competitions: {
      countAll: vi.fn().mockResolvedValue(0),
      countByType: vi.fn().mockResolvedValue(0),
    } as unknown as CompetitionsService,
    leagues: zero() as unknown as LeaguesService,
    rulesSets: zero() as unknown as RulesSetsService,
    eras: zero() as unknown as ErasService,
    players: zero() as unknown as PlayersService,
    positions: zero() as unknown as PositionsService,
    races: zero() as unknown as RacesService,
    externalSystems: zero() as unknown as ExternalSystemsService,
  };
}

describe('buildFactTree', () => {
  it('exposes exactly four leaf facts', () => {
    expect(collectLeaves(buildFactTree(deps()))).toHaveLength(4);
  });

  it('wires coach.toplist.matches.played to the coach match-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'coach.toplist.matches.played');
    await (leaf as () => Promise<unknown>)();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.coaches.countMatchesPlayedByCoach).toHaveBeenCalled();
  });

  it('wires coach.toplist.teams to the coach team-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'coach.toplist.teams');
    await (leaf as () => Promise<unknown>)();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.coaches.countTeamsByCoach).toHaveBeenCalled();
  });

  it('wires team.toplist.matches.played to the team match-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'team.toplist.matches.played');
    await (leaf as () => Promise<unknown>)();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countMatchesPlayedByTeam).toHaveBeenCalled();
  });

  it('wires stats to the entity-count summary', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'stats');
    await (leaf as () => Promise<unknown>)();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(d.leagues.countAll).toHaveBeenCalled();
  });
});
