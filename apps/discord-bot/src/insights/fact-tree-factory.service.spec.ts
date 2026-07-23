import { afterEach, describe, expect, it, vi } from 'vitest';

import { FactTreeFactoryService } from './fact-tree-factory.service';
import { FactTreeUtilsService } from './fact-tree-utils.service';
import type { CoachToplistService } from './facts/coach-toplist.service';
import type { ErasListService } from './facts/eras-list.service';
import type { ExpensiveMistakesToplistService } from './facts/expensive-mistakes-toplist.service';
import type { PlayerToplistService } from './facts/player-toplist.service';
import type { RaceToplistService } from './facts/race-toplist.service';
import type { StatsSummaryFactsService } from './facts/stats-summary.service';
import type { TeamToplistService } from './facts/team-toplist.service';

const factTreeUtils = new FactTreeUtilsService();

function makeFactory() {
  const coachToplist = {
    resolveMatchesPlayed: vi
      .fn()
      .mockResolvedValue('coach matches played toplist'),
    resolveTeams: vi.fn().mockResolvedValue('coach teams toplist'),
    resolveCompetitionsPlayed: vi
      .fn()
      .mockResolvedValue('coach competitions played toplist'),
    resolveErasActive: vi.fn().mockResolvedValue('coach eras active toplist'),
  } as unknown as CoachToplistService;
  const teamToplist = {
    resolveMatchesPlayed: vi.fn().mockResolvedValue(''),
    resolveCompetitionsPlayed: vi.fn().mockResolvedValue(''),
    resolveErasActive: vi.fn().mockResolvedValue(''),
    resolveTouchdownsScored: vi.fn().mockResolvedValue(''),
    resolveCompletions: vi.fn().mockResolvedValue(''),
    resolveInterceptions: vi.fn().mockResolvedValue(''),
    resolveDeflections: vi.fn().mockResolvedValue(''),
    resolveCasualtiesCaused: vi.fn().mockResolvedValue(''),
    resolveCasualtiesSuffered: vi.fn().mockResolvedValue(''),
    resolveSeriousInjuriesCaused: vi.fn().mockResolvedValue(''),
    resolveSeriousInjuriesSuffered: vi.fn().mockResolvedValue(''),
    resolveLastingInjuriesSuffered: vi.fn().mockResolvedValue(''),
    resolveDeathsCaused: vi.fn().mockResolvedValue(''),
    resolveDeathsSuffered: vi.fn().mockResolvedValue(''),
    resolveFoulsCommitted: vi.fn().mockResolvedValue(''),
    resolveTimesSentOff: vi.fn().mockResolvedValue(''),
  } as unknown as TeamToplistService;
  const playerToplist = {
    resolveMvps: vi.fn().mockResolvedValue(''),
    resolveTouchdownsScored: vi.fn().mockResolvedValue(''),
    resolveCompletions: vi.fn().mockResolvedValue(''),
    resolveInterceptions: vi.fn().mockResolvedValue(''),
    resolveDeflections: vi.fn().mockResolvedValue(''),
    resolveCasualtiesCaused: vi.fn().mockResolvedValue(''),
    resolveCasualtiesSuffered: vi.fn().mockResolvedValue(''),
    resolveSeriousInjuriesCaused: vi.fn().mockResolvedValue(''),
    resolveSeriousInjuriesSuffered: vi.fn().mockResolvedValue(''),
    resolveLastingInjuriesSuffered: vi.fn().mockResolvedValue(''),
    resolveDeathsCaused: vi.fn().mockResolvedValue(''),
    resolveFoulsCommitted: vi.fn().mockResolvedValue(''),
    resolveTimesSentOff: vi.fn().mockResolvedValue(''),
  } as unknown as PlayerToplistService;
  const raceToplist = {
    resolveTeams: vi.fn().mockResolvedValue(''),
    resolveMatchesPlayed: vi.fn().mockResolvedValue(''),
  } as unknown as RaceToplistService;
  const expensiveMistakes = {
    resolveTotal: vi.fn().mockResolvedValue(''),
    resolveBiggest: vi.fn().mockResolvedValue(''),
  } as unknown as ExpensiveMistakesToplistService;
  const erasList = {
    resolve: vi.fn().mockResolvedValue(''),
  } as unknown as ErasListService;
  const statsSummary = {
    resolve: vi.fn().mockResolvedValue(''),
  } as unknown as StatsSummaryFactsService;

  const factory = new FactTreeFactoryService(
    coachToplist,
    teamToplist,
    playerToplist,
    raceToplist,
    expensiveMistakes,
    erasList,
    statsSummary,
  );
  return { factory, coachToplist };
}

describe('FactTreeFactoryService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('build() returns the fully assembled fact tree', () => {
    const { factory } = makeFactory();
    const tree = factory.build();
    // buildFactTree currently produces 39 leaves (see fact-tree.spec.ts).
    expect(factTreeUtils.collectLeaves(tree)).toHaveLength(39);
  });

  it('wires its injected services into the tree so leaves call the right service', async () => {
    const { factory, coachToplist } = makeFactory();
    const leaf = factTreeUtils.resolvePath(
      factory.build(),
      'coach.toplist.matches.played',
    );
    expect(leaf).toBeDefined();
    // resolvePath returns a FactNode; narrow to a leaf and resolve it.
    await (
      leaf as { resolve: (e?: number, c?: number) => Promise<unknown> }
    ).resolve();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(coachToplist.resolveMatchesPlayed).toHaveBeenCalled();
  });
});
