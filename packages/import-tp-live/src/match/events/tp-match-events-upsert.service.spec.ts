import type {
  ImportError,
  UpsertMatchEvent,
} from '@blood-bowl-tracker/api-contract';
import {
  MatchEventsService,
  PlayersService,
} from '@blood-bowl-tracker/game-data';
import type {
  TpMatchEvent,
  TpRosterPlayer,
} from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpUpsertRunnerService } from '../../tp-upsert-runner.service';
import {
  AWAY_ROSTER_ID,
  AWAY_TEAM_ERA_ID,
  ERA_ID,
  HOME_ROSTER_ID,
  HOME_TEAM_ERA_ID,
  MATCH_DB_ID,
  MATCH_TP_ID,
  matchContext,
  TP_SYSTEM_ID,
  tpMatch,
} from '../tp-match.test-helpers';
import { TpMatchEventsBuilderService } from './tp-match-events-builder.service';
import type {
  CasualtyPairing,
  FoulPairing,
} from './tp-match-events-correlation.service';
import { TpMatchEventsCorrelationService } from './tp-match-events-correlation.service';
import { TpMatchEventsUpsertService } from './tp-match-events-upsert.service';

type UpsertedEvent = Awaited<ReturnType<MatchEventsService['upsert']>>;

// Minimal events: the service only reads `lineUpId` and hands each event to
// the (mocked) builder unchanged.
const TOUCHDOWN = {
  type: 'touchdown',
  tpEventId: 71,
  lineUpId: 5001,
  rosterId: HOME_ROSTER_ID,
} as unknown as TpMatchEvent;
const WEATHER = {
  type: 'weather_roll',
  tpEventId: 72,
  weatherType: 'Nice',
} as unknown as TpMatchEvent;

function player(id: number): TpRosterPlayer {
  return {
    id,
    name: `Player ${id}`,
    number: 1,
    lineUpMasterId: 77,
    rosterId: HOME_ROSTER_ID,
    fallbackPositionName: 'Lineman',
    isBigGuy: false,
    totalStarPlayerPoints: 0,
  };
}

function eventData(externalId: string): UpsertMatchEvent {
  return {
    matchId: MATCH_DB_ID,
    externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId }],
  };
}

describe('TpMatchEventsUpsertService', () => {
  let service: TpMatchEventsUpsertService;
  let builder: MockProxy<TpMatchEventsBuilderService>;
  let correlation: MockProxy<TpMatchEventsCorrelationService>;
  let players: MockProxy<PlayersService>;
  let matchEvents: MockProxy<MatchEventsService>;
  let casualtyPairing: CasualtyPairing;
  let foulPairing: FoulPairing;
  let errors: ImportError[];

  beforeEach(async () => {
    builder = mock<TpMatchEventsBuilderService>();
    correlation = mock<TpMatchEventsCorrelationService>();
    players = mock<PlayersService>();
    matchEvents = mock<MatchEventsService>();
    casualtyPairing = mock<CasualtyPairing>();
    foulPairing = mock<FoulPairing>();
    errors = [];
    correlation.correlateCasualties.mockReturnValue(casualtyPairing);
    correlation.correlateFouls.mockReturnValue(foulPairing);
    players.resolveBatch.mockResolvedValue([]);
    builder.buildEventData.mockReturnValue([]);
    matchEvents.upsert.mockResolvedValue(mock<UpsertedEvent>());
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMatchEventsUpsertService,
        TpUpsertRunnerService,
        { provide: TpMatchEventsBuilderService, useValue: builder },
        { provide: TpMatchEventsCorrelationService, useValue: correlation },
        { provide: PlayersService, useValue: players },
        { provide: MatchEventsService, useValue: matchEvents },
      ],
    }).compile();
    service = moduleRef.get(TpMatchEventsUpsertService);
  });

  it('builds every event with the resolved context and upserts each built row', async () => {
    const match = tpMatch({ matchEvents: [TOUCHDOWN, WEATHER] });
    players.resolveBatch.mockResolvedValue([{ found: false }]);
    builder.buildEventData
      .mockReturnValueOnce([eventData('tp-71')])
      .mockReturnValueOnce([eventData('tp-72-home'), eventData('tp-72-away')]);

    const imported = await service.upsertEvents({
      match,
      matchId: MATCH_DB_ID,
      context: matchContext(),
      errors,
    });

    expect(imported).toBe(3);
    expect(correlation.correlateCasualties).toHaveBeenCalledWith(
      match.matchEvents,
    );
    expect(correlation.correlateFouls).toHaveBeenCalledWith(
      match.matchEvents,
      casualtyPairing,
    );
    expect(builder.buildEventData).toHaveBeenCalledWith({
      event: TOUCHDOWN,
      matchId: MATCH_DB_ID,
      eraId: ERA_ID,
      tpSystemId: TP_SYSTEM_ID,
      teamErasByRosterId: new Map([
        [HOME_ROSTER_ID, [{ id: HOME_TEAM_ERA_ID, eraId: ERA_ID }]],
        [AWAY_ROSTER_ID, [{ id: AWAY_TEAM_ERA_ID, eraId: ERA_ID }]],
      ]),
      playerIdsByLineUpId: new Map(),
      homeTeamEraId: HOME_TEAM_ERA_ID,
      awayTeamEraId: AWAY_TEAM_ERA_ID,
      errors,
      casualtyPairing,
      foulPairing,
    });
    expect(matchEvents.upsert).toHaveBeenCalledTimes(3);
    expect(matchEvents.upsert).toHaveBeenCalledWith(eventData('tp-71'));
    expect(errors).toEqual([]);
  });

  it("resolves every player the match's roster snapshots and events name, by TP lineUpId", async () => {
    const match = tpMatch({
      matchEvents: [TOUCHDOWN],
      homeRosterPlayers: [player(5001), player(5002)],
      awayRosterPlayers: [player(6001)],
    });
    players.resolveBatch.mockResolvedValue([
      { found: true, id: 700 },
      { found: false },
      { found: true, id: 710 },
    ]);

    await service.upsertEvents({
      match,
      matchId: MATCH_DB_ID,
      context: matchContext(),
      errors,
    });

    expect(players.resolveBatch).toHaveBeenCalledWith([
      { externalSystemId: TP_SYSTEM_ID, externalId: '5001' },
      { externalSystemId: TP_SYSTEM_ID, externalId: '5002' },
      { externalSystemId: TP_SYSTEM_ID, externalId: '6001' },
    ]);
    expect(builder.buildEventData.mock.calls[0][0].playerIdsByLineUpId).toEqual(
      new Map([
        [5001, 700],
        [6001, 710],
      ]),
    );
  });

  it('looks up no players when the match names none', async () => {
    await service.upsertEvents({
      match: tpMatch(),
      matchId: MATCH_DB_ID,
      context: matchContext(),
      errors,
    });

    expect(players.resolveBatch).not.toHaveBeenCalled();
  });

  it('records one error per failed row and still writes the rest', async () => {
    players.resolveBatch.mockResolvedValue([{ found: false }]);
    builder.buildEventData.mockReturnValue([
      eventData('tp-71'),
      eventData('tp-73'),
    ]);
    matchEvents.upsert
      .mockRejectedValueOnce(new Error('conflict'))
      .mockResolvedValueOnce(mock<UpsertedEvent>());

    const imported = await service.upsertEvents({
      match: tpMatch({ matchEvents: [TOUCHDOWN] }),
      matchId: MATCH_DB_ID,
      context: matchContext(),
      errors,
    });

    expect(imported).toBe(1);
    expect(errors).toEqual([
      {
        item: { match: MATCH_TP_ID, event: 'tp-71' },
        message: `Failed to upsert event tp-71 of match ${MATCH_TP_ID}: conflict`,
      },
    ]);
  });
});
