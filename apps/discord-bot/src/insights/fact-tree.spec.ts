import { FACT_SCOPE_ALL_TIME } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import { buildFactTree } from './fact-tree';
import type { FactLeaf, FactTreeDeps } from './fact-tree.types';
import { FactTreeUtilsService } from './fact-tree-utils.service';
import type { CoachToplistService } from './facts/coach-toplist.service';
import type { ErasListService } from './facts/eras-list.service';
import type { ExpensiveMistakesToplistService } from './facts/expensive-mistakes-toplist.service';
import type { PlayerToplistService } from './facts/player-toplist.service';
import type { RaceToplistService } from './facts/race-toplist.service';
import type { StatsSummaryFactsService } from './facts/stats-summary.service';
import type { TeamToplistService } from './facts/team-toplist.service';

const factTreeUtils = new FactTreeUtilsService();

function deps(): FactTreeDeps {
  return {
    coachToplist: {
      resolveMatchesPlayed: vi.fn().mockResolvedValue('coach matches played'),
      resolveTeams: vi.fn().mockResolvedValue('coach teams'),
      resolveCompetitionsPlayed: vi
        .fn()
        .mockResolvedValue('coach competitions played'),
      resolveErasActive: vi.fn().mockResolvedValue('coach eras active'),
    } as unknown as CoachToplistService,
    teamToplist: {
      resolveMatchesPlayed: vi.fn().mockResolvedValue('team matches played'),
      resolveCompetitionsPlayed: vi
        .fn()
        .mockResolvedValue('team competitions played'),
      resolveErasActive: vi.fn().mockResolvedValue('team eras active'),
      resolveTouchdownsScored: vi
        .fn()
        .mockResolvedValue('team touchdowns scored'),
      resolveCompletions: vi.fn().mockResolvedValue('team completions'),
      resolveInterceptions: vi.fn().mockResolvedValue('team interceptions'),
      resolveDeflections: vi.fn().mockResolvedValue('team deflections'),
      resolveCasualtiesCaused: vi
        .fn()
        .mockResolvedValue('team casualties caused'),
      resolveCasualtiesSuffered: vi
        .fn()
        .mockResolvedValue('team casualties suffered'),
      resolveSeriousInjuriesCaused: vi
        .fn()
        .mockResolvedValue('team serious injuries caused'),
      resolveSeriousInjuriesSuffered: vi
        .fn()
        .mockResolvedValue('team serious injuries suffered'),
      resolveLastingInjuriesSuffered: vi
        .fn()
        .mockResolvedValue('team lasting injuries suffered'),
      resolveDeathsCaused: vi.fn().mockResolvedValue('team deaths caused'),
      resolveDeathsSuffered: vi.fn().mockResolvedValue('team deaths suffered'),
      resolveFoulsCommitted: vi.fn().mockResolvedValue('team fouls committed'),
      resolveTimesSentOff: vi.fn().mockResolvedValue('team times sent off'),
    } as unknown as TeamToplistService,
    playerToplist: {
      resolveMvps: vi.fn().mockResolvedValue('player mvps'),
      resolveTouchdownsScored: vi
        .fn()
        .mockResolvedValue('player touchdowns scored'),
      resolveCompletions: vi.fn().mockResolvedValue('player completions'),
      resolveInterceptions: vi.fn().mockResolvedValue('player interceptions'),
      resolveDeflections: vi.fn().mockResolvedValue('player deflections'),
      resolveCasualtiesCaused: vi
        .fn()
        .mockResolvedValue('player casualties caused'),
      resolveCasualtiesSuffered: vi
        .fn()
        .mockResolvedValue('player casualties suffered'),
      resolveSeriousInjuriesCaused: vi
        .fn()
        .mockResolvedValue('player serious injuries caused'),
      resolveSeriousInjuriesSuffered: vi
        .fn()
        .mockResolvedValue('player serious injuries suffered'),
      resolveLastingInjuriesSuffered: vi
        .fn()
        .mockResolvedValue('player lasting injuries suffered'),
      resolveDeathsCaused: vi.fn().mockResolvedValue('player deaths caused'),
      resolveFoulsCommitted: vi
        .fn()
        .mockResolvedValue('player fouls committed'),
      resolveTimesSentOff: vi.fn().mockResolvedValue('player times sent off'),
    } as unknown as PlayerToplistService,
    raceToplist: {
      resolveTeams: vi.fn().mockResolvedValue('race teams'),
      resolveMatchesPlayed: vi.fn().mockResolvedValue('race matches played'),
    } as unknown as RaceToplistService,
    expensiveMistakes: {
      resolveTotal: vi.fn().mockResolvedValue('expensive mistakes total'),
      resolveBiggest: vi.fn().mockResolvedValue('expensive mistakes biggest'),
    } as unknown as ExpensiveMistakesToplistService,
    erasList: {
      resolve: vi.fn().mockResolvedValue('eras list'),
    } as unknown as ErasListService,
    statsSummary: {
      resolve: vi.fn().mockResolvedValue('stats summary'),
    } as unknown as StatsSummaryFactsService,
  };
}

describe('buildFactTree', () => {
  it('exposes exactly thirty-nine leaf facts', () => {
    expect(factTreeUtils.collectLeaves(buildFactTree(deps()))).toHaveLength(39);
  });

  it('wires coach.toplist.matches.played to CoachToplistService.resolveMatchesPlayed', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'coach.toplist.matches.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.coachToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });

  it('wires coach.toplist.teams to CoachToplistService.resolveTeams', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'coach.toplist.teams',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.coachToplist.resolveTeams).toHaveBeenCalled();
  });

  it('wires coach.toplist.competitions.played to CoachToplistService.resolveCompetitionsPlayed', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'coach.toplist.competitions.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.coachToplist.resolveCompetitionsPlayed).toHaveBeenCalled();
  });

  it('wires coach.toplist.eras.active to CoachToplistService.resolveErasActive', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'coach.toplist.eras.active',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.coachToplist.resolveErasActive).toHaveBeenCalled();
  });

  it('wires team.toplist.matches.played to TeamToplistService.resolveMatchesPlayed', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.matches.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });

  it('wires team.toplist.competitions.played to TeamToplistService.resolveCompetitionsPlayed', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.competitions.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveCompetitionsPlayed).toHaveBeenCalled();
  });

  it('wires team.toplist.eras.active to TeamToplistService.resolveErasActive', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.eras.active',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveErasActive).toHaveBeenCalled();
  });

  it('wires team.toplist.touchdowns.scored to TeamToplistService.resolveTouchdownsScored', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveTouchdownsScored).toHaveBeenCalled();
  });

  it('wires team.toplist.completions to TeamToplistService.resolveCompletions', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.completions',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveCompletions).toHaveBeenCalled();
  });

  it('wires team.toplist.interceptions to TeamToplistService.resolveInterceptions', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.interceptions',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveInterceptions).toHaveBeenCalled();
  });

  it('wires team.toplist.deflections to TeamToplistService.resolveDeflections', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.deflections',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveDeflections).toHaveBeenCalled();
  });

  it('wires player.toplist.mvps to PlayerToplistService.resolveMvps', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.mvps',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.playerToplist.resolveMvps).toHaveBeenCalled();
  });

  it('wires player.toplist.touchdowns.scored to PlayerToplistService.resolveTouchdownsScored', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.playerToplist.resolveTouchdownsScored).toHaveBeenCalled();
  });

  it('wires player.toplist.completions to PlayerToplistService.resolveCompletions', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.completions',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.playerToplist.resolveCompletions).toHaveBeenCalled();
  });

  it('wires player.toplist.interceptions to PlayerToplistService.resolveInterceptions', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.interceptions',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.playerToplist.resolveInterceptions).toHaveBeenCalled();
  });

  it('wires player.toplist.deflections to PlayerToplistService.resolveDeflections', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.deflections',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.playerToplist.resolveDeflections).toHaveBeenCalled();
  });

  it('wires team.toplist.casualties.caused to TeamToplistService.resolveCasualtiesCaused', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.casualties.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveCasualtiesCaused).toHaveBeenCalled();
  });

  it('wires team.toplist.injuries.serious.caused to TeamToplistService.resolveSeriousInjuriesCaused', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.injuries.serious.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveSeriousInjuriesCaused).toHaveBeenCalled();
  });

  it('wires team.toplist.deaths.caused to TeamToplistService.resolveDeathsCaused', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.deaths.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveDeathsCaused).toHaveBeenCalled();
  });

  it('wires team.toplist.casualties.suffered to TeamToplistService.resolveCasualtiesSuffered', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.casualties.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveCasualtiesSuffered).toHaveBeenCalled();
  });

  it('wires team.toplist.injuries.serious.suffered to TeamToplistService.resolveSeriousInjuriesSuffered', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.injuries.serious.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveSeriousInjuriesSuffered).toHaveBeenCalled();
  });

  it('wires team.toplist.injuries.lasting.suffered to TeamToplistService.resolveLastingInjuriesSuffered', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.injuries.lasting.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveLastingInjuriesSuffered).toHaveBeenCalled();
  });

  it('wires team.toplist.deaths.suffered to TeamToplistService.resolveDeathsSuffered', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.deaths.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveDeathsSuffered).toHaveBeenCalled();
  });

  it('wires team.toplist.fouls.committed to TeamToplistService.resolveFoulsCommitted', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.fouls.committed',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveFoulsCommitted).toHaveBeenCalled();
  });

  it('wires team.toplist.sent_off to TeamToplistService.resolveTimesSentOff', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.sent_off',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.teamToplist.resolveTimesSentOff).toHaveBeenCalled();
  });

  it('wires team.toplist.expensiveMistakes.total to ExpensiveMistakesToplistService.resolveTotal', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.expensiveMistakes.total',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.expensiveMistakes.resolveTotal).toHaveBeenCalled();
  });

  it('wires team.toplist.expensiveMistakes.biggest to ExpensiveMistakesToplistService.resolveBiggest', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.expensiveMistakes.biggest',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.expensiveMistakes.resolveBiggest).toHaveBeenCalled();
  });

  it('wires player.toplist.casualties.caused to PlayerToplistService.resolveCasualtiesCaused', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.casualties.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.playerToplist.resolveCasualtiesCaused).toHaveBeenCalled();
  });

  it('wires player.toplist.injuries.serious.caused to PlayerToplistService.resolveSeriousInjuriesCaused', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.injuries.serious.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.playerToplist.resolveSeriousInjuriesCaused).toHaveBeenCalled();
  });

  it('wires player.toplist.deaths.caused to PlayerToplistService.resolveDeathsCaused', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.deaths.caused',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.playerToplist.resolveDeathsCaused).toHaveBeenCalled();
  });

  it('wires player.toplist.casualties.suffered to PlayerToplistService.resolveCasualtiesSuffered', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.casualties.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.playerToplist.resolveCasualtiesSuffered).toHaveBeenCalled();
  });

  it('wires player.toplist.injuries.serious.suffered to PlayerToplistService.resolveSeriousInjuriesSuffered', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.injuries.serious.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.playerToplist.resolveSeriousInjuriesSuffered).toHaveBeenCalled();
  });

  it('wires player.toplist.injuries.lasting.suffered to PlayerToplistService.resolveLastingInjuriesSuffered', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.injuries.lasting.suffered',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.playerToplist.resolveLastingInjuriesSuffered).toHaveBeenCalled();
  });

  it('wires player.toplist.fouls.committed to PlayerToplistService.resolveFoulsCommitted', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.fouls.committed',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.playerToplist.resolveFoulsCommitted).toHaveBeenCalled();
  });

  it('wires player.toplist.sent_off to PlayerToplistService.resolveTimesSentOff', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'player.toplist.sent_off',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.playerToplist.resolveTimesSentOff).toHaveBeenCalled();
  });

  it('wires race.toplist.teams to RaceToplistService.resolveTeams', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'race.toplist.teams',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.raceToplist.resolveTeams).toHaveBeenCalled();
  });

  it('wires race.toplist.matches.played to RaceToplistService.resolveMatchesPlayed', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'race.toplist.matches.played',
    );
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.raceToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });

  it('wires stats to StatsSummaryFactsService.resolve', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(buildFactTree(d), 'stats');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.statsSummary.resolve).toHaveBeenCalled();
  });

  it('wires eras.list to ErasListService.resolve', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(buildFactTree(d), 'eras.list');
    await (leaf as FactLeaf).resolve(FACT_SCOPE_ALL_TIME);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.erasList.resolve).toHaveBeenCalled();
  });
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
        factTreeUtils.resolvePath(tree, 'team.toplist.eras.active'),
        factTreeUtils.resolvePath(tree, 'coach.toplist.eras.active'),
      ]),
    );
    expect(unsupported).toHaveLength(3);
  });
});

describe('buildFactTree league capabilities', () => {
  it('every leaf supports league exactly when it supports era (except eras.list)', () => {
    const tree = buildFactTree(deps());
    const leaves = factTreeUtils.collectLeaves(tree);
    const erasList = factTreeUtils.resolvePath(tree, 'eras.list');
    for (const leaf of leaves) {
      if (leaf === erasList) {
        // eras.list supports league but not era
        expect(leaf.supportsLeague).toBe(true);
        expect(leaf.supportsEra).toBe(false);
      } else {
        expect(leaf.supportsLeague).toBe(leaf.supportsEra);
      }
    }
  });
});

describe('buildFactTree competition capabilities', () => {
  it('includes only the team/player toplists and stats that support competition filtering', () => {
    const tree = buildFactTree(deps());
    const supported = factTreeUtils
      .collectLeaves(tree)
      .filter((leaf) => leaf.supportsCompetition);
    expect(supported).toEqual(
      expect.arrayContaining([
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
        factTreeUtils.resolvePath(tree, 'stats'),
      ]),
    );
    expect(supported).toHaveLength(29);
  });

  it('forwards competitionId to an in-scope team leaf', async () => {
    const d = deps();
    const leaf = factTreeUtils.resolvePath(
      buildFactTree(d),
      'team.toplist.touchdowns.scored',
    );
    await (leaf as FactLeaf).resolve({ competitionId: 30 });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
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
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(d.playerToplist.resolveMvps).toHaveBeenCalledWith({
      competitionId: 30,
    });
  });
});
