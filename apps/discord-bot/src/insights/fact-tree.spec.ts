import type {
  CoachesService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import { buildFactTree } from './fact-tree';
import { collectLeaves, resolvePath } from './fact-tree-utils';

function deps() {
  const coaches = {
    countMatchesPlayedByCoach: vi.fn().mockResolvedValue([]),
    countTeamsByCoach: vi.fn().mockResolvedValue([]),
  } as unknown as CoachesService;
  const teams = {
    countMatchesPlayedByTeam: vi.fn().mockResolvedValue([]),
  } as unknown as TeamsService;
  return { coaches, teams };
}

describe('buildFactTree', () => {
  it('exposes exactly three leaf facts', () => {
    expect(collectLeaves(buildFactTree(deps()))).toHaveLength(3);
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
});
