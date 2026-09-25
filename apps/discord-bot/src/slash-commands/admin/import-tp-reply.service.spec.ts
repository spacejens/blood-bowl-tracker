import type {
  ImportResult,
  TpOfficialTeamsImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpLiveTeamImportResult } from '@blood-bowl-tracker/import-tp-live';
import { Test } from '@nestjs/testing';
import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
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
      providers: [ImportTpReplyService],
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
            },
          ],
          participation: imported(0),
          trophyAwards: imported(0),
          era: 'Fourth era',
        },
      });

      const { description } = embed(reply);
      expect(description.startsWith('**Completed with errors**')).toBe(true);
      expect(description).toContain('- Teams: 0 of 1 imported, 0 players');
      expect(description).toContain('- Team 163386: no coach');
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
          team: failedWith('could not resolve coach'),
          players: imported(0),
          era: undefined,
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
          '- Team: could not resolve coach',
        ].join('\n'),
      );
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

  it("truncates a description past Discord's embed limit", () => {
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
        })),
        participation: imported(0),
        trophyAwards: imported(0),
        era: 'Fourth era',
      },
    });

    const { description } = embed(reply);
    expect(description).toHaveLength(MAX_DESCRIPTION_LENGTH);
    expect(description.endsWith('…')).toBe(true);
  });
});
