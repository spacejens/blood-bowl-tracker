import type { ImportResult } from '@blood-bowl-tracker/api-contract';
import type { TpLiveTeamImportResult } from '@blood-bowl-tracker/import-tp-live';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TpImportAssessment } from './tp-import-failure.service';
import { TpImportFailureService } from './tp-import-failure.service';

const imported = (count: number): ImportResult => ({
  success: true,
  imported: count,
  errors: [],
});
const failedWith = (message: string): ImportResult => ({
  success: false,
  imported: 0,
  errors: [{ item: 1, message }],
});
const team = (players: number): TpLiveTeamImportResult => ({
  team: imported(1),
  players: imported(players),
  era: 'Fourth era',
  teamEra: { id: 31, eraId: 40 },
});
const assessment = (
  status: TpImportAssessment['status'],
): TpImportAssessment => ({
  subject: 'team 1',
  status,
  notes: [],
  rows: [],
  errors: [],
});

describe('TpImportFailureService', () => {
  let service: TpImportFailureService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpImportFailureService],
    }).compile();
    service = moduleRef.get(TpImportFailureService);
  });

  describe('assess', () => {
    it('assesses a clean team import as completed, with its rows and era', () => {
      expect(
        service.assess({ kind: 'roster', rosterId: 163386, result: team(12) }),
      ).toEqual({
        subject: 'team 163386',
        status: 'completed',
        notes: ['Era: Fourth era'],
        rows: [
          { label: 'Team', summary: '1 imported' },
          { label: 'Players', summary: '12 imported' },
        ],
        errors: [],
      });
    });

    it('assesses a team that was not imported as failed, labelling its error', () => {
      const result = service.assess({
        kind: 'roster',
        rosterId: 163386,
        result: {
          team: failedWith('could not resolve race for code "orc"'),
          players: imported(0),
          era: undefined,
          teamEra: undefined,
        },
      });

      expect(result.status).toBe('failed');
      expect(result.notes).toEqual(['Era: not resolved']);
      expect(result.errors).toEqual([
        { label: 'Team', message: 'could not resolve race for code "orc"' },
      ]);
    });

    it('assesses a match TP reports as not completed as failed', () => {
      const result = service.assess({
        kind: 'match',
        tournamentSlug: 's30',
        matchId: 576264,
        result: {
          competition: imported(0),
          homeTeam: team(0),
          awayTeam: team(0),
          starPlayerHires: imported(0),
          match: failedWith('TP match 576264 is not completed yet'),
          participation: imported(0),
          events: imported(0),
          outcome: imported(0),
        },
      });

      expect(result.subject).toBe('match 576264 (s30)');
      expect(result.status).toBe('failed');
      expect(result.errors).toEqual([
        { label: 'Match', message: 'TP match 576264 is not completed yet' },
      ]);
    });

    it('assesses a match with a stage error but the match imported as completed with errors', () => {
      const result = service.assess({
        kind: 'match',
        tournamentSlug: 's30',
        matchId: 576264,
        result: {
          competition: imported(1),
          homeTeam: team(12),
          awayTeam: team(11),
          starPlayerHires: failedWith('no catalog characteristics'),
          match: imported(1),
          participation: imported(2),
          events: imported(40),
          outcome: imported(1),
        },
      });

      expect(result.status).toBe('completedWithErrors');
      expect(result.errors).toEqual([
        { label: 'Star player hires', message: 'no catalog characteristics' },
      ]);
    });

    it("labels a competition's team errors by roster id", () => {
      const result = service.assess({
        kind: 'competition',
        tournamentSlug: 's30',
        result: {
          competition: imported(1),
          teams: [
            {
              rosterId: 7,
              team: failedWith('no coach'),
              players: imported(0),
              era: undefined,
              teamEra: undefined,
            },
          ],
          participation: imported(0),
          trophyAwards: imported(0),
          era: 'Fourth era',
        },
      });

      expect(result.subject).toBe('competition s30');
      expect(result.status).toBe('completedWithErrors');
      expect(result.rows).toContainEqual({
        label: 'Teams',
        summary: '0 of 1 imported, 0 players',
      });
      expect(result.errors).toEqual([{ label: 'Team 7', message: 'no coach' }]);
    });

    it('assesses an official team list with no rules set written as failed', () => {
      const result = service.assess({
        kind: 'officialTeams',
        result: {
          rulesSets: [
            {
              rulesSet: 'BB2025',
              fetch: failedWith('status 429'),
              write: undefined,
            },
          ],
        },
      });

      expect(result).toEqual({
        subject: 'official teams',
        status: 'failed',
        notes: [],
        rows: [
          {
            label: 'Rules set BB2025',
            summary: 'fetched 0 races, nothing written',
          },
        ],
        errors: [{ label: 'Rules set BB2025 fetch', message: 'status 429' }],
      });
    });

    describe('match teams', () => {
      const notImported: TpLiveTeamImportResult = {
        team: failedWith('no coach'),
        players: imported(0),
        era: undefined,
        teamEra: undefined,
      };

      it('assesses both teams of an unfinished match imported as completed', () => {
        expect(
          service.assess({
            kind: 'matchTeams',
            tournamentSlug: 's31',
            matchId: 670570,
            result: {
              match: imported(0),
              homeTeam: team(12),
              awayTeam: team(11),
            },
          }),
        ).toEqual({
          subject: 'teams of match 670570 (s31)',
          status: 'completed',
          notes: ['Era: Fourth era'],
          rows: [
            { label: 'Home team', summary: '1 imported' },
            { label: 'Home players', summary: '12 imported' },
            { label: 'Away team', summary: '1 imported' },
            { label: 'Away players', summary: '11 imported' },
          ],
          errors: [],
        });
      });

      it('assesses a failed match fetch as failed, labelled Match', () => {
        const result = service.assess({
          kind: 'matchTeams',
          tournamentSlug: 's31',
          matchId: 670570,
          result: {
            match: failedWith('Could not fetch TP match 670570: status 429'),
            homeTeam: { ...notImported, team: imported(0) },
            awayTeam: { ...notImported, team: imported(0) },
          },
        });

        expect(result.status).toBe('failed');
        expect(result.errors).toEqual([
          {
            label: 'Match',
            message: 'Could not fetch TP match 670570: status 429',
          },
        ]);
      });

      it('assesses an away team that was not imported as failed', () => {
        const result = service.assess({
          kind: 'matchTeams',
          tournamentSlug: 's31',
          matchId: 670570,
          result: {
            match: imported(0),
            homeTeam: team(12),
            awayTeam: notImported,
          },
        });

        expect(result.status).toBe('failed');
        expect(result.errors).toEqual([
          { label: 'Away team', message: 'no coach' },
        ]);
      });

      it('assesses a player error with both teams imported as completed with errors', () => {
        const result = service.assess({
          kind: 'matchTeams',
          tournamentSlug: 's31',
          matchId: 670570,
          result: {
            match: imported(0),
            homeTeam: { ...team(0), players: failedWith('unknown position') },
            awayTeam: team(11),
          },
        });

        expect(result.status).toBe('completedWithErrors');
        expect(result.errors).toEqual([
          { label: 'Home players', message: 'unknown position' },
        ]);
      });
    });
  });

  describe('isRealFailure', () => {
    it('is not a failure when completed', () => {
      expect(service.isRealFailure(assessment('completed'))).toBe(false);
    });

    it('is a failure when completed with errors', () => {
      expect(service.isRealFailure(assessment('completedWithErrors'))).toBe(
        true,
      );
    });

    it('is a failure when failed', () => {
      expect(service.isRealFailure(assessment('failed'))).toBe(true);
    });
  });
});
