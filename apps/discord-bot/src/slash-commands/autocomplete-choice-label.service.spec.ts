import { CoachesQueriesService } from '@blood-bowl-tracker/game-data-queries';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { PlayerContextService } from '../insights/player-context.service';
import { TeamContextService } from '../insights/team-context.service';
import { DateRangeFormatterService } from '../shared/date-range-formatter.service';
import { AutocompleteChoiceLabelService } from './autocomplete-choice-label.service';

describe('AutocompleteChoiceLabelService', () => {
  let service: AutocompleteChoiceLabelService;
  let teamContext: MockProxy<TeamContextService>;
  let playerContext: MockProxy<PlayerContextService>;
  let coachesQueries: MockProxy<CoachesQueriesService>;
  let dateRangeFormatter: MockProxy<DateRangeFormatterService>;

  beforeEach(async () => {
    teamContext = mock<TeamContextService>();
    playerContext = mock<PlayerContextService>();
    coachesQueries = mock<CoachesQueriesService>();
    dateRangeFormatter = mock<DateRangeFormatterService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AutocompleteChoiceLabelService,
        { provide: TeamContextService, useValue: teamContext },
        { provide: PlayerContextService, useValue: playerContext },
        { provide: CoachesQueriesService, useValue: coachesQueries },
        { provide: DateRangeFormatterService, useValue: dateRangeFormatter },
      ],
    }).compile();
    service = moduleRef.get(AutocompleteChoiceLabelService);
  });

  describe('teamChoices', () => {
    it('labels a team "<name> (<race>, <coach>)" with its id as the value', async () => {
      const rows = [{ id: 8, name: '40 Thieves' }];
      teamContext.attachSuffixes.mockResolvedValue(
        rows.map((row) => ({ ...row, contextSuffix: ' (Orc, Skarsnik)' })),
      );

      await expect(service.teamChoices(rows)).resolves.toEqual([
        { name: '40 Thieves (Orc, Skarsnik)', value: '8' },
      ]);
      const [inputRows, teamIdOf, options] =
        teamContext.attachSuffixes.mock.calls[0];
      expect(inputRows).toEqual(rows);
      expect(teamIdOf(rows[0])).toBe(8);
      expect(options).toEqual({ includeRace: true, includeCoach: true });
    });

    it('shows the bare name when the team has no context', async () => {
      const rows = [{ id: 8, name: '40 Thieves' }];
      teamContext.attachSuffixes.mockResolvedValue(
        rows.map((row) => ({ ...row, contextSuffix: '' })),
      );

      await expect(service.teamChoices(rows)).resolves.toEqual([
        { name: '40 Thieves', value: '8' },
      ]);
    });
  });

  describe('playerChoices', () => {
    it('labels a player with the full toplist context and its id as the value', async () => {
      const rows = [{ id: 9, name: 'Griff' }];
      playerContext.attachSuffixes.mockResolvedValue(
        rows.map((row) => ({
          ...row,
          contextSuffix: ' (Blitzer, Reikland Reavers, Human, BB2020, Roze-El)',
        })),
      );

      await expect(service.playerChoices(rows)).resolves.toEqual([
        {
          name: 'Griff (Blitzer, Reikland Reavers, Human, BB2020, Roze-El)',
          value: '9',
        },
      ]);
      const [inputRows, playerIdOf, options] =
        playerContext.attachSuffixes.mock.calls[0];
      expect(inputRows).toEqual(rows);
      expect(playerIdOf(rows[0])).toBe(9);
      expect(options).toEqual({
        includePosition: true,
        includeTeam: true,
        includeRace: true,
        includeEra: true,
        includeCoach: true,
      });
    });

    it('shows the bare name when the player has no context', async () => {
      const rows = [{ id: 9, name: 'Griff' }];
      playerContext.attachSuffixes.mockResolvedValue(
        rows.map((row) => ({ ...row, contextSuffix: '' })),
      );

      await expect(service.playerChoices(rows)).resolves.toEqual([
        { name: 'Griff', value: '9' },
      ]);
    });
  });

  describe('coachChoices', () => {
    it('labels a coach with their formatted career span', async () => {
      coachesQueries.getCareerSpansByIds.mockResolvedValue(
        new Map([[5, { start: '2021-09-01', end: '2023-06-10' }]]),
      );
      dateRangeFormatter.format.mockReturnValue('2021-09-01 – 2023-06-10');

      await expect(
        service.coachChoices([{ id: 5, name: 'Roze-El' }]),
      ).resolves.toEqual([
        { name: 'Roze-El (2021-09-01 – 2023-06-10)', value: '5' },
      ]);
      expect(coachesQueries.getCareerSpansByIds).toHaveBeenCalledWith([5]);
      expect(dateRangeFormatter.format).toHaveBeenCalledWith(
        '2021-09-01',
        '2023-06-10',
      );
    });

    it('shows the bare name for a coach with no recorded matches', async () => {
      coachesQueries.getCareerSpansByIds.mockResolvedValue(new Map());

      await expect(
        service.coachChoices([{ id: 5, name: 'Roze-El' }]),
      ).resolves.toEqual([{ name: 'Roze-El', value: '5' }]);
      expect(dateRangeFormatter.format).not.toHaveBeenCalled();
    });
  });

  describe('datedScopeChoices', () => {
    it('labels an era or competition "<name> (<league>, <dates>)"', () => {
      dateRangeFormatter.format.mockReturnValue('2021-09-01 – present');

      expect(
        service.datedScopeChoices([
          {
            id: 3,
            name: 'BB2020',
            leagueName: 'Premier League',
            startDate: '2021-09-01',
            endDate: null,
          },
        ]),
      ).toEqual([
        { name: 'BB2020 (Premier League, 2021-09-01 – present)', value: '3' },
      ]);
      expect(dateRangeFormatter.format).toHaveBeenCalledWith(
        '2021-09-01',
        null,
      );
    });
  });

  describe('100-character limit', () => {
    it('keeps a label of exactly 100 characters untouched', () => {
      // ' (L, D)' is 7 characters, so a 93-character name makes exactly 100.
      dateRangeFormatter.format.mockReturnValue('D');
      const name = 'n'.repeat(93);

      const [choice] = service.datedScopeChoices([
        { id: 1, name, leagueName: 'L', startDate: 'x', endDate: null },
      ]);

      expect(choice.name).toBe(`${name} (L, D)`);
      expect(choice.name).toHaveLength(100);
    });

    it('cuts an over-long suffix to fit, ending with an ellipsis', () => {
      dateRangeFormatter.format.mockReturnValue('d'.repeat(200));

      const [choice] = service.datedScopeChoices([
        {
          id: 1,
          name: 'BB2020',
          leagueName: 'Premier League',
          startDate: 'x',
          endDate: null,
        },
      ]);

      expect(choice.name).toHaveLength(100);
      expect(choice.name.startsWith('BB2020 (Premier League, ddd')).toBe(true);
      expect(choice.name.endsWith('…')).toBe(true);
      expect(choice.value).toBe('1');
    });

    it('trims an over-long name itself rather than dropping it', async () => {
      const name = 'n'.repeat(150);
      const rows = [{ id: 2, name }];
      teamContext.attachSuffixes.mockResolvedValue(
        rows.map((row) => ({ ...row, contextSuffix: ' (Orc, Skarsnik)' })),
      );

      const [choice] = await service.teamChoices(rows);

      expect(choice.name).toBe(`${'n'.repeat(99)}…`);
    });
  });
});
