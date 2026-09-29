import type {
  ImportResult,
  TpOfficialTeamsImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpLiveTeamImportResult } from '@blood-bowl-tracker/import-tp-live';
import { Test } from '@nestjs/testing';
import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { ErrorListFitService } from '../../tp-import/error-list-fit.service';
import { TpImportFailureService } from '../../tp-import/tp-import-failure.service';
import { ImportTpReplyService } from './import-tp-reply.service';

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

/** The reply's single embed. */
function embed(reply: unknown): { title: string; description: string } {
  return (reply as { embeds: { title: string; description: string }[] })
    .embeds[0];
}

describe('ImportTpReplyService', () => {
  let service: ImportTpReplyService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImportTpReplyService,
        TpImportFailureService,
        ErrorListFitService,
      ],
    }).compile();
    service = moduleRef.get(ImportTpReplyService);
  });

  it('replies ephemerally', () => {
    const reply = service.build({
      kind: 'roster',
      rosterId: 163386,
      result: team(12),
    });

    expect(reply.flags).toBe(MessageFlags.Ephemeral);
  });

  describe('competition', () => {
    it('summarizes each stage and the era', () => {
      const reply = service.build({
        kind: 'competition',
        tournamentSlug: 's30',
        result: {
          competition: imported(1),
          teams: [
            { rosterId: 1, ...team(12) },
            { rosterId: 2, ...team(11) },
          ],
          participation: imported(2),
          trophyAwards: imported(1),
          extraTrophyAwards: imported(2),
          era: 'Fourth era',
        },
      });

      expect(embed(reply)).toEqual({
        title: 'TP import: competition s30',
        description: [
          '**Completed**',
          'Era: Fourth era',
          '',
          '- Competition: 1 imported',
          '- Teams: 2 of 2 imported, 23 players',
          '- Participation: 2 imported',
          '- Trophy awards: 1 imported',
          '- Extra trophy awards: 2 imported',
        ].join('\n'),
      });
    });

    it('reports an unresolvable era as a failure', () => {
      const reply = service.build({
        kind: 'competition',
        tournamentSlug: 's30',
        result: {
          competition: failedWith('Could not resolve an era'),
          teams: [],
          participation: imported(0),
          trophyAwards: imported(0),
          extraTrophyAwards: imported(0),
          era: undefined,
        },
      });

      expect(embed(reply).description).toBe(
        [
          '**Failed**',
          'Era: not resolved',
          '',
          '- Competition: 0 imported',
          '- Teams: 0 of 0 imported, 0 players',
          '- Participation: 0 imported',
          '- Trophy awards: 0 imported',
          '- Extra trophy awards: 0 imported',
          '',
          '**Errors**',
          '- Competition: Could not resolve an era',
        ].join('\n'),
      );
    });

    it("calls out a team's failure without failing the whole import", () => {
      const reply = service.build({
        kind: 'competition',
        tournamentSlug: 's30',
        result: {
          competition: imported(1),
          teams: [
            {
              rosterId: 163386,
              team: failedWith('no coach'),
              players: imported(0),
              era: undefined,
              teamEra: undefined,
            },
          ],
          participation: imported(0),
          trophyAwards: imported(0),
          extraTrophyAwards: imported(0),
          era: 'Fourth era',
        },
      });

      const { description } = embed(reply);
      expect(description.startsWith('**Completed with errors**')).toBe(true);
      expect(description).toContain('- Teams: 0 of 1 imported, 0 players');
      expect(description).toContain('- Team 163386: no coach');
    });

    it("reports the matches backfill when it ran, with each backfilled match's errors", () => {
      const reply = service.build({
        kind: 'competition',
        tournamentSlug: 's30',
        result: {
          competition: imported(1),
          teams: [],
          participation: imported(0),
          trophyAwards: imported(0),
          extraTrophyAwards: imported(0),
          era: 'Fourth era',
          matchesBackfill: {
            success: false,
            imported: 5,
            errors: [{ item: 1, message: 'match 7 not completed' }],
          },
        },
      });

      expect(embed(reply).description).toBe(
        [
          '**Completed with errors**',
          'Era: Fourth era',
          '',
          '- Competition: 1 imported',
          '- Teams: 0 of 0 imported, 0 players',
          '- Participation: 0 imported',
          '- Trophy awards: 0 imported',
          '- Extra trophy awards: 0 imported',
          '- Matches backfill: 5 imported',
          '',
          '**Errors**',
          '- Matches backfill: match 7 not completed',
        ].join('\n'),
      );
    });
  });

  describe('match', () => {
    it('summarizes every stage', () => {
      const reply = service.build({
        kind: 'match',
        tournamentSlug: 's30',
        matchId: 576264,
        result: {
          competition: imported(1),
          homeTeam: team(12),
          awayTeam: team(11),
          starPlayerHires: imported(1),
          match: imported(1),
          participation: imported(2),
          events: imported(40),
          outcome: imported(1),
        },
      });

      expect(embed(reply)).toEqual({
        title: 'TP import: match 576264 (s30)',
        description: [
          '**Completed**',
          'Era: Fourth era',
          '',
          '- Competition: 1 imported',
          '- Home team: 1 imported',
          '- Home players: 12 imported',
          '- Away team: 1 imported',
          '- Away players: 11 imported',
          '- Star player hires: 1 imported',
          '- Match: 1 imported',
          '- Participation: 2 imported',
          '- Events: 40 imported',
          '- Outcome: 1 imported',
        ].join('\n'),
      });
    });

    it('fails when the match itself was not imported', () => {
      const reply = service.build({
        kind: 'match',
        tournamentSlug: 's30',
        matchId: 576264,
        result: {
          competition: imported(0),
          homeTeam: team(0),
          awayTeam: team(0),
          starPlayerHires: imported(0),
          match: failedWith('match not completed'),
          participation: imported(0),
          events: imported(0),
          outcome: imported(0),
        },
      });

      const { description } = embed(reply);
      expect(description.startsWith('**Failed**')).toBe(true);
      expect(description).toContain('- Match: match not completed');
    });

    it('lists a star player hire error under its stage', () => {
      const reply = service.build({
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

      const { description } = embed(reply);
      expect(description.startsWith('**Completed with errors**')).toBe(true);
      expect(description).toContain(
        '- Star player hires: no catalog characteristics',
      );
    });

    it('reports the competition backfill a match import ran after creating the competition', () => {
      const reply = service.build({
        kind: 'match',
        tournamentSlug: 's30',
        matchId: 576264,
        result: {
          competition: imported(1),
          homeTeam: team(12),
          awayTeam: team(11),
          starPlayerHires: imported(1),
          match: imported(1),
          participation: imported(2),
          events: imported(40),
          outcome: imported(1),
          participantsBackfill: {
            teams: [
              { rosterId: 1, ...team(12) },
              {
                rosterId: 2,
                team: failedWith('no coach'),
                players: imported(0),
                era: undefined,
                teamEra: undefined,
              },
            ],
            participation: imported(1),
            trophyAwards: imported(0),
            awardsFetched: 0,
          },
          matchesBackfill: imported(6),
          extraTrophyAwards: imported(0),
        },
      });

      expect(embed(reply).description).toBe(
        [
          '**Completed with errors**',
          'Era: Fourth era',
          '',
          '- Competition: 1 imported',
          '- Home team: 1 imported',
          '- Home players: 12 imported',
          '- Away team: 1 imported',
          '- Away players: 11 imported',
          '- Star player hires: 1 imported',
          '- Match: 1 imported',
          '- Participation: 2 imported',
          '- Events: 40 imported',
          '- Outcome: 1 imported',
          '- Backfilled teams: 1 of 2 imported, 12 players',
          '- Backfilled participation: 1 imported',
          '- Backfilled trophy awards: 0 imported',
          '- Backfilled extra trophy awards: 0 imported',
          '- Matches backfill: 6 imported',
          '',
          '**Errors**',
          '- Team 2: no coach',
        ].join('\n'),
      );
    });
  });

  describe('roster', () => {
    it('summarizes the team, its players and its era', () => {
      const reply = service.build({
        kind: 'roster',
        rosterId: 163386,
        result: team(12),
      });

      expect(embed(reply)).toEqual({
        title: 'TP import: team 163386',
        description: [
          '**Completed**',
          'Era: Fourth era',
          '',
          '- Team: 1 imported',
          '- Players: 12 imported',
        ].join('\n'),
      });
    });

    it('fails when the team was not imported', () => {
      const reply = service.build({
        kind: 'roster',
        rosterId: 163386,
        result: {
          team: failedWith('could not resolve race for code "orc"'),
          players: imported(0),
          era: undefined,
          teamEra: undefined,
        },
      });

      expect(embed(reply).description).toBe(
        [
          '**Failed**',
          'Era: not resolved',
          '',
          '- Team: 0 imported',
          '- Players: 0 imported',
          '',
          '**Errors**',
          '- Team: could not resolve race for code "orc"',
        ].join('\n'),
      );
    });
  });

  it("summarizes a match's teams import", () => {
    const reply = service.build({
      kind: 'matchTeams',
      tournamentSlug: 's31',
      matchId: 670570,
      result: { match: imported(0), homeTeam: team(12), awayTeam: team(11) },
    });

    expect(embed(reply)).toEqual({
      title: 'TP import: teams of match 670570 (s31)',
      description: [
        '**Completed**',
        'Era: Fourth era',
        '',
        '- Home team: 1 imported',
        '- Home players: 12 imported',
        '- Away team: 1 imported',
        '- Away players: 11 imported',
      ].join('\n'),
    });
  });

  describe('official teams', () => {
    const write: TpOfficialTeamsImportResult = {
      races: imported(30),
      positions: imported(200),
      characteristics: imported(190),
      keywords: failedWith('unknown keyword Foo'),
      startingSkills: imported(300),
      positionCharacteristics: [],
    };

    it('summarizes each rules set, calling out stage errors', () => {
      const reply = service.build({
        kind: 'officialTeams',
        result: {
          rulesSets: [
            { rulesSet: 'BB2025', fetch: imported(30), write },
            {
              rulesSet: 'BB2020',
              fetch: failedWith('status 429'),
              write: undefined,
            },
          ],
        },
      });

      expect(embed(reply)).toEqual({
        title: 'TP import: official teams',
        description: [
          '**Completed with errors**',
          '',
          '- Rules set BB2025: fetched 30 races; wrote 30 races, 200 positions, 190 characteristics, 0 keywords, 300 starting skills',
          '- Rules set BB2020: fetched 0 races, nothing written',
          '',
          '**Errors**',
          '- Rules set BB2025 keywords: unknown keyword Foo',
          '- Rules set BB2020 fetch: status 429',
        ].join('\n'),
      });
    });

    it('fails when no rules set was written', () => {
      const reply = service.build({
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

      expect(embed(reply).description.startsWith('**Failed**')).toBe(true);
    });
  });

  it("lists as many errors as fit Discord's embed limit and says how many were left out", () => {
    const reply = service.build({
      kind: 'competition',
      tournamentSlug: 's30',
      result: {
        competition: imported(1),
        teams: Array.from({ length: 200 }, (_, index) => ({
          rosterId: index,
          team: failedWith('x'.repeat(100)),
          players: imported(0),
          era: undefined,
          teamEra: undefined,
        })),
        participation: imported(0),
        trophyAwards: imported(0),
        extraTrophyAwards: imported(0),
        era: 'Fourth era',
      },
    });

    const { description } = embed(reply);
    const shown = description
      .split('\n')
      .filter((line) => line.startsWith('- Team ')).length;
    expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    expect(shown).toBeGreaterThan(0);
    expect(
      description.endsWith(`…and ${200 - shown} more errors not shown.`),
    ).toBe(true);
  });

  describe('unexpected failure', () => {
    it('replies ephemerally with a failed status and the error message', () => {
      expect(
        service.buildUnexpectedFailure(new Error('database down')),
      ).toEqual({
        embeds: [
          {
            title: 'TP import failed',
            description: [
              '**Failed**',
              '',
              '**Errors**',
              '- Unexpected error: database down',
            ].join('\n'),
          },
        ],
        flags: MessageFlags.Ephemeral,
      });
    });

    it('shows a non-Error as a string', () => {
      expect(
        embed(service.buildUnexpectedFailure('boom')).description.endsWith(
          '- Unexpected error: boom',
        ),
      ).toBe(true);
    });

    it('falls back to the error name when the message is empty', () => {
      const error = new TypeError('');

      expect(
        embed(service.buildUnexpectedFailure(error)).description.endsWith(
          '- Unexpected error: TypeError',
        ),
      ).toBe(true);
    });

    it("cuts a very long message short at Discord's embed limit", () => {
      const { description } = embed(
        service.buildUnexpectedFailure(new Error('x'.repeat(5000))),
      );

      expect(description).toHaveLength(MAX_DESCRIPTION_LENGTH);
      expect(description.endsWith('x…')).toBe(true);
    });
  });
});
