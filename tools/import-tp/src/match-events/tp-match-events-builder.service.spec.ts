import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import type { TpMatchEvent } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpMatchEventKindBuildersService } from './tp-match-event-kind-builders.service';
import type { BuildEventDataOptions } from './tp-match-events-builder.service';
import { TpMatchEventsBuilderService } from './tp-match-events-builder.service';
import type { CasualtyPairing } from './tp-match-events-correlation.service';

const MATCH_DB_ID = 7;
const ERA_ID = 500;
const TP_SYSTEM_ID = 1;
const HOME_ROSTER_ID = 164868;
const AWAY_ROSTER_ID = 167242;
const HOME_TEAM_ERA_ID = 501;
const AWAY_TEAM_ERA_ID = 502;
const ACTOR_LINE_UP_ID = 2442075;
const VICTIM_LINE_UP_ID = 2459782;

/**
 * An opaque, canned collaborator return value. This spec asserts that
 * whatever the kind-builder returns comes back unchanged — never what is
 * *inside* it (that is `TpMatchEventKindBuildersService`'s own specs' job).
 */
const BUILT: UpsertMatchEvent[] = [
  {
    matchId: MATCH_DB_ID,
    actionType: 'touchdown',
    externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'built' }],
  },
];

function emptyCasualtyPairing(): CasualtyPairing {
  return {
    casualtyByInjuryEventId: new Map(),
    pairedCasualtyEventIds: new Set(),
  };
}

function optionsFor(
  event: TpMatchEvent,
  casualtyPairing: CasualtyPairing = emptyCasualtyPairing(),
): BuildEventDataOptions {
  return {
    event,
    matchId: MATCH_DB_ID,
    eraId: ERA_ID,
    tpSystemId: TP_SYSTEM_ID,
    teamErasByRosterId: new Map([
      [HOME_ROSTER_ID, [{ id: HOME_TEAM_ERA_ID, eraId: ERA_ID }]],
      [AWAY_ROSTER_ID, [{ id: AWAY_TEAM_ERA_ID, eraId: ERA_ID }]],
    ]),
    playerIdsByLineUpId: new Map([[ACTOR_LINE_UP_ID, 8001]]),
    homeTeamEraId: HOME_TEAM_ERA_ID,
    awayTeamEraId: AWAY_TEAM_ERA_ID,
    errors: [],
    casualtyPairing,
  };
}

describe('TpMatchEventsBuilderService', () => {
  let service: TpMatchEventsBuilderService;
  let eventBuilders: MockProxy<TpMatchEventKindBuildersService>;

  beforeEach(async () => {
    eventBuilders = mock<TpMatchEventKindBuildersService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMatchEventsBuilderService,
        {
          provide: TpMatchEventKindBuildersService,
          useValue: eventBuilders,
        },
      ],
    }).compile();
    service = moduleRef.get(TpMatchEventsBuilderService);
  });

  describe('resolveTeamEraId', () => {
    it('delegates to the kind builders with the same options and returns its value', () => {
      eventBuilders.resolveTeamEraId.mockReturnValue(HOME_TEAM_ERA_ID);
      const options = {
        teamErasByRosterId: new Map([
          [HOME_ROSTER_ID, [{ id: HOME_TEAM_ERA_ID, eraId: ERA_ID }]],
        ]),
        rosterId: HOME_ROSTER_ID,
        eraId: ERA_ID,
      };

      expect(service.resolveTeamEraId(options)).toBe(HOME_TEAM_ERA_ID);
      expect(eventBuilders.resolveTeamEraId).toHaveBeenCalledWith(options);
    });

    it('returns undefined verbatim when the kind builders cannot resolve it', () => {
      eventBuilders.resolveTeamEraId.mockReturnValue(undefined);

      expect(
        service.resolveTeamEraId({
          teamErasByRosterId: new Map(),
          rosterId: 999999,
          eraId: ERA_ID,
        }),
      ).toBeUndefined();
    });
  });

  describe('buildEventData dispatch', () => {
    it.each([
      'touchdown',
      'completion',
      'interception',
      'deflection',
      'foul',
      'successful_landing',
    ] as const)(
      'dispatches a %s event to buildSimpleActionEvent with its own type as the action type',
      (type) => {
        eventBuilders.buildSimpleActionEvent.mockReturnValue(BUILT);
        const options = optionsFor({
          type,
          tpEventId: 1,
          instant: 'x',
          lineUpId: ACTOR_LINE_UP_ID,
          rosterId: HOME_ROSTER_ID,
        });

        expect(service.buildEventData(options)).toBe(BUILT);
        expect(eventBuilders.buildSimpleActionEvent).toHaveBeenCalledWith(
          options,
          type,
        );
      },
    );

    it('dispatches an mvp_award event to buildSimpleActionEvent with the mvp_award action type', () => {
      eventBuilders.buildSimpleActionEvent.mockReturnValue(BUILT);
      const options = optionsFor({
        type: 'mvp_award',
        tpEventId: 2,
        instant: 'x',
        lineUpId: ACTOR_LINE_UP_ID,
        rosterId: HOME_ROSTER_ID,
      });

      expect(service.buildEventData(options)).toBe(BUILT);
      expect(eventBuilders.buildSimpleActionEvent).toHaveBeenCalledWith(
        options,
        'mvp_award',
      );
    });

    it('dispatches a sent_off event to buildSentOffEvent', () => {
      eventBuilders.buildSentOffEvent.mockReturnValue(BUILT);
      const options = optionsFor({
        type: 'sent_off',
        tpEventId: 3,
        instant: 'x',
        lineUpId: ACTOR_LINE_UP_ID,
        rosterId: HOME_ROSTER_ID,
      });

      expect(service.buildEventData(options)).toBe(BUILT);
      expect(eventBuilders.buildSentOffEvent).toHaveBeenCalledWith(options);
      expect(eventBuilders.buildSimpleActionEvent).not.toHaveBeenCalled();
    });

    it('dispatches an injury event to buildInjuryEvent', () => {
      eventBuilders.buildInjuryEvent.mockReturnValue(BUILT);
      const options = optionsFor({
        type: 'injury',
        tpEventId: 4,
        instant: 'x',
        lineUpId: VICTIM_LINE_UP_ID,
        rosterId: AWAY_ROSTER_ID,
        turnRosterId: HOME_ROSTER_ID,
        injuryType: 'Dead',
      });

      expect(service.buildEventData(options)).toBe(BUILT);
      expect(eventBuilders.buildInjuryEvent).toHaveBeenCalledWith(options);
    });

    it('dispatches an UNpaired casualty_caused event to buildCasualtyCausedEvent', () => {
      eventBuilders.buildCasualtyCausedEvent.mockReturnValue(BUILT);
      const options = optionsFor({
        type: 'casualty_caused',
        tpEventId: 5,
        instant: 'x',
        lineUpId: ACTOR_LINE_UP_ID,
        rosterId: HOME_ROSTER_ID,
        turnNumber: 3,
      });

      expect(service.buildEventData(options)).toBe(BUILT);
      expect(eventBuilders.buildCasualtyCausedEvent).toHaveBeenCalledWith(
        options,
      );
    });

    it('returns no events for a casualty_caused event already paired into an injury row, without calling the kind builders', () => {
      const options = optionsFor(
        {
          type: 'casualty_caused',
          tpEventId: 6,
          instant: 'x',
          lineUpId: ACTOR_LINE_UP_ID,
          rosterId: HOME_ROSTER_ID,
          turnNumber: 3,
        },
        {
          casualtyByInjuryEventId: new Map(),
          pairedCasualtyEventIds: new Set([6]),
        },
      );

      expect(service.buildEventData(options)).toEqual([]);
      expect(eventBuilders.buildCasualtyCausedEvent).not.toHaveBeenCalled();
    });

    it('dispatches every other event kind to buildAdminEvents', () => {
      eventBuilders.buildAdminEvents.mockReturnValue(BUILT);
      const options = optionsFor({
        type: 'weather_roll',
        tpEventId: 7,
        instant: 'x',
        weatherType: 'perfect_conditions',
      });

      expect(service.buildEventData(options)).toBe(BUILT);
      expect(eventBuilders.buildAdminEvents).toHaveBeenCalledWith(options);
    });
  });
});
