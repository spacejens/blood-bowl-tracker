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
import type { FactLeaf } from './fact-tree-utils';
import { collectLeaves, resolvePath } from './fact-tree-utils';
import type { StatsSummaryDeps } from './facts/stats-summary';

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

function leafAt(path: string): FactLeaf {
  const tree = buildFactTree({} as StatsSummaryDeps);
  const node = resolvePath(tree, path);
  if (node === undefined || !('resolve' in node)) {
    throw new Error(`Expected a leaf at ${path}`);
  }
  return node as FactLeaf;
}

describe('buildFactTree', () => {
  it('exposes exactly four leaf facts', () => {
    expect(collectLeaves(buildFactTree(deps()))).toHaveLength(4);
  });

  it('wires coach.toplist.matches.played to the coach match-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'coach.toplist.matches.played');
    await (leaf as FactLeaf).resolve();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.coaches.countMatchesPlayedByCoach).toHaveBeenCalled();
  });

  it('wires coach.toplist.teams to the coach team-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'coach.toplist.teams');
    await (leaf as FactLeaf).resolve();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.coaches.countTeamsByCoach).toHaveBeenCalled();
  });

  it('wires team.toplist.matches.played to the team match-count query', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'team.toplist.matches.played');
    await (leaf as FactLeaf).resolve();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teams.countMatchesPlayedByTeam).toHaveBeenCalled();
  });

  it('wires stats to the entity-count summary', async () => {
    const d = deps();
    const leaf = resolvePath(buildFactTree(d), 'stats');
    await (leaf as FactLeaf).resolve();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(d.leagues.countAll).toHaveBeenCalled();
  });
});

describe('buildFactTree leaf capabilities', () => {
  it('marks coach.toplist.matches.played as era-supporting', () => {
    expect(leafAt('coach.toplist.matches.played').supportsEra).toBe(true);
  });

  it('marks coach.toplist.teams as era-supporting', () => {
    expect(leafAt('coach.toplist.teams').supportsEra).toBe(true);
  });

  it('marks team.toplist.matches.played as era-supporting', () => {
    expect(leafAt('team.toplist.matches.played').supportsEra).toBe(true);
  });

  it('marks stats as NOT era-supporting', () => {
    expect(leafAt('stats').supportsEra).toBe(false);
  });

  it('every leaf except stats supports era filtering', () => {
    const leaves = collectLeaves(buildFactTree({} as StatsSummaryDeps));
    const unsupported = leaves.filter((leaf) => !leaf.supportsEra);
    // Exactly one leaf (stats) opts out.
    expect(unsupported).toHaveLength(1);
  });
});
