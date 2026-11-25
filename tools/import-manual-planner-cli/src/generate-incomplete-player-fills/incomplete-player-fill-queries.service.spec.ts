import { DB } from '@blood-bowl-tracker/db';
import { mockDb, type MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { CandidateMatchQueriesService } from './candidate-match-queries.service';
import { CandidateQueriesService } from './candidate-queries.service';
import { EraRulesQueriesService } from './era-rules-queries.service';
import type { CandidateScopeRow } from './fill-query.types';
import { FillQueryScopeService } from './fill-query-scope.service';
import { IncompletePlayerFillQueriesService } from './incomplete-player-fill-queries.service';
import { LastingInjuryRepairQueriesService } from './lasting-injury-repair-queries.service';
import { LookupQueriesService } from './lookup-queries.service';
import { PositionRulesQueriesService } from './position-rules-queries.service';

const SNAPSHOT = { isolationLevel: 'repeatable read', accessMode: 'read only' };

const CANDIDATE: CandidateScopeRow = {
  playerId: 1,
  tpId: '500',
  teamId: 20,
  teamEraId: 21,
  positionId: 30,
  eraId: 4,
  sppTotal: 5,
  unspentSpp: null,
  status: null,
  isJourneyman: false,
  move: 0,
  strength: 0,
  agility: 0,
  passing: null,
  armour: 0,
};
const SECOND: CandidateScopeRow = {
  ...CANDIDATE,
  playerId: 2,
  tpId: '501',
  teamEraId: 22,
};
const TEAM_PLAYER = {
  playerId: 1,
  teamId: 20,
  eraId: 4,
  positionId: 30,
  playerName: 'Flame',
  positionName: 'Gnoblar Lineman',
  sppTotal: 20,
  unspentSpp: null,
  isJourneyman: true,
  isIncomplete: true,
};

describe('IncompletePlayerFillQueriesService', () => {
  let service: IncompletePlayerFillQueriesService;
  let database: MockDbResult;
  let candidates: MockProxy<CandidateQueriesService>;
  let matchQueries: MockProxy<CandidateMatchQueriesService>;
  let positionRules: MockProxy<PositionRulesQueriesService>;
  let eraRules: MockProxy<EraRulesQueriesService>;
  let lookups: MockProxy<LookupQueriesService>;
  let repairs: MockProxy<LastingInjuryRepairQueriesService>;

  beforeEach(async () => {
    database = mockDb();
    candidates = mock<CandidateQueriesService>();
    matchQueries = mock<CandidateMatchQueriesService>();
    positionRules = mock<PositionRulesQueriesService>();
    eraRules = mock<EraRulesQueriesService>();
    lookups = mock<LookupQueriesService>();
    repairs = mock<LastingInjuryRepairQueriesService>();
    candidates.candidates.mockResolvedValue([CANDIDATE, SECOND]);
    candidates.teamPlayers.mockResolvedValue([TEAM_PLAYER]);
    candidates.storedAdvancements.mockResolvedValue([]);
    candidates.paidAdvancements.mockResolvedValue([]);
    candidates.freeSkillRiskPlayerIds.mockResolvedValue([9]);
    matchQueries.consequences.mockResolvedValue([
      { playerId: 1, hasStatReduction: false, hasDeath: true },
      { playerId: 2, hasStatReduction: true, hasDeath: true },
    ]);
    matchQueries.deathTimes.mockResolvedValue([]);
    matchQueries.statReductionEvents.mockResolvedValue([]);
    matchQueries.teamCompetitions.mockResolvedValue([]);
    positionRules.positionRulesSets.mockResolvedValue([]);
    positionRules.positionSkills.mockResolvedValue([]);
    positionRules.positionAccess.mockResolvedValue([]);
    positionRules.bigGuyPositions.mockResolvedValue([]);
    eraRules.eraRulesSets.mockResolvedValue([]);
    eraRules.skillCategories.mockResolvedValue([]);
    eraRules.advancementCosts.mockResolvedValue([]);
    lookups.ongoingCompetitions.mockResolvedValue([
      { competitionId: 2, competitionName: 'Ogretoberfest 14', teamId: 21 },
      { competitionId: 1, competitionName: 'Major Season 31', teamId: 20 },
      { competitionId: 2, competitionName: 'Ogretoberfest 14', teamId: 20 },
    ]);
    lookups.teamRosters.mockResolvedValue([{ teamId: 20, rosterId: '24801' }]);
    lookups.skillNames.mockResolvedValue([]);
    lookups.tpSkillIds.mockResolvedValue([]);
    lookups.tpPositionIds.mockResolvedValue([]);
    lookups.attributedSkillIds.mockResolvedValue([300]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        IncompletePlayerFillQueriesService,
        // Pure and dependency-free: passed real, so the scoped ids are the real ones.
        FillQueryScopeService,
        { provide: DB, useValue: database.db },
        { provide: CandidateQueriesService, useValue: candidates },
        { provide: CandidateMatchQueriesService, useValue: matchQueries },
        { provide: PositionRulesQueriesService, useValue: positionRules },
        { provide: EraRulesQueriesService, useValue: eraRules },
        { provide: LookupQueriesService, useValue: lookups },
        { provide: LastingInjuryRepairQueriesService, useValue: repairs },
      ],
    }).compile();
    service = moduleRef.get(IncompletePlayerFillQueriesService);
  });

  it('reads everything in one read-only repeatable-read transaction', async () => {
    await service.load();

    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(database.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      SNAPSHOT,
    );
    expect(candidates.candidates).toHaveBeenCalledWith(database.db);
  });

  it('assembles the planner rows', async () => {
    const rows = await service.load();

    for (const row of rows.candidates) {
      expect(row).not.toHaveProperty('teamEraId');
    }
    expect(rows.candidates.map((row) => row.playerId)).toEqual([1, 2]);
    expect(rows.statReductionPlayerIds).toEqual([2]);
    expect(rows.deathPlayerIds).toEqual([1, 2]);
    expect(rows.freeSkillRiskPlayerIds).toEqual([9]);
    expect(rows.teamPlayers).toEqual([TEAM_PLAYER]);
    expect(rows.teamRosters).toEqual([{ teamId: 20, rosterId: '24801' }]);
    expect(rows.attributedSkillIds).toEqual([300]);
    expect(rows.ongoingTeamIds).toEqual([21, 20]);
  });

  it('lists ongoing competitions by name, then id, with their team counts', async () => {
    const rows = await service.load();

    expect(rows.ongoingCompetitions).toEqual([
      { competitionId: 1, name: 'Major Season 31', teamCount: 1 },
      { competitionId: 2, name: 'Ogretoberfest 14', teamCount: 2 },
    ]);
  });

  it('lists same-named ongoing competitions apart, by id', async () => {
    lookups.ongoingCompetitions.mockResolvedValue([
      { competitionId: 8, competitionName: 'Cup', teamId: 20 },
      { competitionId: 7, competitionName: 'Cup', teamId: 21 },
    ]);

    const rows = await service.load();

    expect(rows.ongoingCompetitions).toEqual([
      { competitionId: 7, name: 'Cup', teamCount: 1 },
      { competitionId: 8, name: 'Cup', teamCount: 1 },
    ]);
  });

  it('runs with no ongoing competition, skipping no team', async () => {
    lookups.ongoingCompetitions.mockResolvedValue([]);

    const rows = await service.load();

    expect(rows.ongoingTeamIds).toEqual([]);
    expect(rows.ongoingCompetitions).toEqual([]);
  });

  it("scopes the candidate queries by the candidates' ids", async () => {
    await service.load();

    const tx = database.db;
    expect(candidates.teamPlayers).toHaveBeenCalledWith(tx, [20]);
    expect(matchQueries.consequences).toHaveBeenCalledWith(tx, [1, 2]);
    expect(positionRules.positionRulesSets).toHaveBeenCalledWith(tx, [
      { positionId: 30, eraId: 4 },
    ]);
    expect(lookups.tpPositionIds).toHaveBeenCalledWith(tx, [30]);
    expect(lookups.teamRosters).toHaveBeenCalledWith(tx, [20]);
  });

  it("scopes the pricing queries by the team players' eras and positions", async () => {
    await service.load();

    const tx = database.db;
    expect(eraRules.eraRulesSets).toHaveBeenCalledWith(tx, [4]);
    expect(eraRules.advancementCosts).toHaveBeenCalledWith(tx, [4]);
    expect(positionRules.positionAccess).toHaveBeenCalledWith(tx, [
      { positionId: 30, eraId: 4 },
    ]);
    expect(candidates.paidAdvancements).toHaveBeenCalledWith(tx, {
      teamIds: [20],
      playerIds: [1],
    });
  });

  it('reads team competitions only for candidates with a stat reduction', async () => {
    await service.load();

    expect(matchQueries.teamCompetitions).toHaveBeenCalledWith(database.db, [
      { playerId: 2, teamEraId: 22 },
    ]);
  });

  it('passes on a query failure', async () => {
    candidates.storedAdvancements.mockRejectedValue(
      new Error('connection lost'),
    );

    await expect(service.load()).rejects.toThrow('connection lost');
  });

  it('reads the lasting-injury repair candidates in their own read-only snapshot', async () => {
    const repair = {
      player: { system: 'tourplay.net' as const, id: '929761' },
      line: { ma: 6, st: 3, ag: 3, pa: null, av: 8 },
      increases: [],
      context: null,
    };
    repairs.candidates.mockResolvedValue([repair]);

    await expect(service.loadLastingInjuryRepairCandidates()).resolves.toEqual([
      repair,
    ]);

    expect(database.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      SNAPSHOT,
    );
    expect(repairs.candidates).toHaveBeenCalledWith(database.db);
  });
});
