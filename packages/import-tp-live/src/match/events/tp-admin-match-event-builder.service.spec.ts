import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpAdminMatchEventBuilderService } from './tp-admin-match-event-builder.service';
import { TpMatchEventHelpersService } from './tp-match-event-helpers.service';
import {
  AWAY_ROSTER_ID,
  AWAY_TEAM_ERA_ID,
  buildOptions,
  HOME_ROSTER_ID,
  HOME_TEAM_ERA_ID,
  MATCH_DB_ID,
  TP_SYSTEM_ID,
  UNKNOWN_ROSTER_ID,
} from './tp-match-event-kind-builders.test-helpers';

/**
 * `TpAdminMatchEventBuilderService.buildAdminEvents` assembly behavior — the
 * actual admin-event construction logic. `TpMatchEventKindBuildersService`
 * only delegates to this service one line deep (see
 * `tp-match-event-kind-builders-admin.spec.ts`, which verifies just the
 * delegation with this service mocked); the real assembly coverage lives
 * here instead, per this repo's normal spec convention: the service under
 * test is the only real provider. `TpMatchEventHelpersService` is passed
 * real rather than mocked — it is this service's sole collaborator, and it
 * is itself a pure, dependency-free formatting service (no injected
 * collaborators of its own, no I/O, no branching on external state), so
 * passing it real carries none of the coupling risk the "never pass a real
 * collaborator" rule guards against.
 */
describe('TpAdminMatchEventBuilderService', () => {
  let service: TpAdminMatchEventBuilderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpAdminMatchEventBuilderService, TpMatchEventHelpersService],
    }).compile();
    service = moduleRef.get(TpAdminMatchEventBuilderService);
  });

  it('emits a neutral eventType weather event with the weatherType payload', () => {
    const events = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'weather_roll',
          tpEventId: 10,
          instant: 'x',
          weatherType: 'perfect_conditions',
        },
      }),
    );

    expect(events).toEqual([
      {
        matchId: MATCH_DB_ID,
        eventType: 'weather',
        weatherType: 'perfect_conditions',
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-10' }],
      },
    ]);
  });

  it('emits an acting inducements event with inducementsCost and no fromTreasury when absent', () => {
    const [data] = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'inducements_roll',
          tpEventId: 11,
          instant: 'x',
          rosterId: HOME_ROSTER_ID,
          totalCost: 80,
          starPlayers: [],
        },
      }),
    );

    expect(data).toEqual({
      matchId: MATCH_DB_ID,
      actionType: 'inducements',
      actingTeamEraId: HOME_TEAM_ERA_ID,
      inducementsCost: 80,
      externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-11' }],
    });
    expect(data.inducementsFromTreasury).toBeUndefined();
  });

  it('emits inducementsFromTreasury when the event carries it', () => {
    const [data] = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'inducements_roll',
          tpEventId: 24,
          instant: 'x',
          rosterId: HOME_ROSTER_ID,
          totalCost: 80,
          starPlayers: [],
          fromTreasury: 50,
        },
      }),
    );

    expect(data.inducementsFromTreasury).toBe(50);
  });

  it('omits actingTeamEraId for an inducements event with an unresolvable rosterId', () => {
    const [data] = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'inducements_roll',
          tpEventId: 25,
          instant: 'x',
          rosterId: UNKNOWN_ROSTER_ID,
          totalCost: 40,
          starPlayers: [],
        },
      }),
    );

    expect(data.actionType).toBe('inducements');
    expect(data.inducementsCost).toBe(40);
    expect(data.actingTeamEraId).toBeUndefined();
  });

  it('emits an acting journeymen_signings event with journeymenCount', () => {
    const [data] = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'journeyman_signing',
          tpEventId: 15,
          instant: 'x',
          rosterId: AWAY_ROSTER_ID,
          journeymenCount: 2,
        },
      }),
    );

    expect(data).toEqual({
      matchId: MATCH_DB_ID,
      actionType: 'journeymen_signings',
      actingTeamEraId: AWAY_TEAM_ERA_ID,
      journeymenCount: 2,
      externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-15' }],
    });
  });

  it('emits an acting secret_objective with secretObjective', () => {
    const [data] = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'secret_objective',
          tpEventId: 42,
          instant: 'x',
          rosterId: HOME_ROSTER_ID,
          secretObjective: 'going_alone',
        },
      }),
    );

    expect(data).toEqual({
      matchId: MATCH_DB_ID,
      actionType: 'secret_objective',
      actingTeamEraId: HOME_TEAM_ERA_ID,
      secretObjective: 'going_alone',
      externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-42' }],
    });
  });

  it('emits an expensive_mistake consequence for the acting roster', () => {
    const [data] = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'expensive_mistake',
          tpEventId: 14,
          instant: 'x',
          rosterId: AWAY_ROSTER_ID,
          expensiveMistake: 5,
        },
      }),
    );

    expect(data).toEqual({
      matchId: MATCH_DB_ID,
      consequenceType: 'expensive_mistake',
      consequenceTeamEraId: AWAY_TEAM_ERA_ID,
      expensiveMistake: 5,
      externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-14' }],
    });
  });

  it('emits two winnings events, one per side, with distinct external ids', () => {
    const events = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'winnings_roll',
          tpEventId: 12,
          instant: 'x',
          localWinnings: 30000,
          visitorWinnings: 10000,
        },
      }),
    );

    expect(events).toEqual([
      {
        matchId: MATCH_DB_ID,
        actionType: 'winnings',
        winnings: 30000,
        actingTeamEraId: HOME_TEAM_ERA_ID,
        externalIds: [
          { externalSystemId: TP_SYSTEM_ID, externalId: 'tp-12-home' },
        ],
      },
      {
        matchId: MATCH_DB_ID,
        actionType: 'winnings',
        winnings: 10000,
        actingTeamEraId: AWAY_TEAM_ERA_ID,
        externalIds: [
          { externalSystemId: TP_SYSTEM_ID, externalId: 'tp-12-away' },
        ],
      },
    ]);
  });

  it('emits two fan_factor events, one per side, carrying the computed total', () => {
    const events = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'fan_factor_roll',
          tpEventId: 13,
          instant: 'x',
          fanFactorLocal: 7,
          fanFactorVisitor: 2,
        },
      }),
    );

    expect(events.map((e) => e.externalIds[0].externalId)).toEqual([
      'tp-13-home',
      'tp-13-away',
    ]);
    expect(
      events.find((e) => e.actingTeamEraId === HOME_TEAM_ERA_ID)?.fanFactor,
    ).toBe(7);
    expect(
      events.find((e) => e.actingTeamEraId === AWAY_TEAM_ERA_ID)?.fanFactor,
    ).toBe(2);
    expect(events.every((e) => e.actionType === 'fan_factor')).toBe(true);
  });

  it('emits both fan_factor events even when a total is 0', () => {
    const events = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'fan_factor_roll',
          tpEventId: 13,
          instant: 'x',
          fanFactorLocal: 0,
          fanFactorVisitor: 2,
        },
      }),
    );

    expect(events).toHaveLength(2);
    expect(
      events.find((e) => e.actingTeamEraId === HOME_TEAM_ERA_ID)?.fanFactor,
    ).toBe(0);
    expect(
      events.find((e) => e.actingTeamEraId === AWAY_TEAM_ERA_ID)?.fanFactor,
    ).toBe(2);
  });

  it('emits two dedicated_fans consequence events, one per side', () => {
    const events = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'dedicated_fans_roll',
          tpEventId: 26,
          instant: 'x',
          dedicatedFansModifierLocal: 1,
          dedicatedFansModifierVisitor: -1,
        },
      }),
    );

    expect(events.map((e) => e.externalIds[0].externalId)).toEqual([
      'tp-26-home',
      'tp-26-away',
    ]);
    expect(
      events.find((e) => e.consequenceTeamEraId === HOME_TEAM_ERA_ID)
        ?.dedicatedFans,
    ).toBe(1);
    expect(
      events.find((e) => e.consequenceTeamEraId === AWAY_TEAM_ERA_ID)
        ?.dedicatedFans,
    ).toBe(-1);
    expect(events.every((e) => e.consequenceType === 'dedicated_fans')).toBe(
      true,
    );
    expect(events.every((e) => e.actionType === undefined)).toBe(true);
  });

  it('skips a dedicated_fans side whose modifier is 0', () => {
    const events = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'dedicated_fans_roll',
          tpEventId: 27,
          instant: 'x',
          dedicatedFansModifierLocal: 0,
          dedicatedFansModifierVisitor: -1,
        },
      }),
    );

    expect(events.map((e) => e.externalIds[0].externalId)).toEqual([
      'tp-27-away',
    ]);
  });

  it('emits no dedicated_fans event when both sides are unchanged', () => {
    const events = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'dedicated_fans_roll',
          tpEventId: 28,
          instant: 'x',
          dedicatedFansModifierLocal: 0,
          dedicatedFansModifierVisitor: 0,
        },
      }),
    );

    expect(events).toEqual([]);
  });

  it('emits a neutral prayers_to_nuffle with the prayersToNuffle payload', () => {
    const [data] = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'prayers_to_nuffle',
          tpEventId: 23,
          instant: 'x',
          prayersToNuffle: 4,
        },
      }),
    );

    expect(data).toEqual({
      matchId: MATCH_DB_ID,
      actionType: 'prayers_to_nuffle',
      prayersToNuffle: 4,
      externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-23' }],
    });
    expect(data.actingTeamEraId).toBeUndefined();
  });

  it('emits a concession consequence for the conceding home side', () => {
    const [data] = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'concession',
          tpEventId: 20,
          instant: 'x',
          concedeLocal: true,
          concedeVisitor: false,
        },
      }),
    );

    expect(data).toEqual({
      matchId: MATCH_DB_ID,
      consequenceType: 'concession',
      consequenceTeamEraId: HOME_TEAM_ERA_ID,
      externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: 'tp-20' }],
    });
  });

  it('emits a concession consequence for the conceding away side', () => {
    const [data] = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'concession',
          tpEventId: 21,
          instant: 'x',
          concedeLocal: false,
          concedeVisitor: true,
        },
      }),
    );

    expect(data.consequenceType).toBe('concession');
    expect(data.consequenceTeamEraId).toBe(AWAY_TEAM_ERA_ID);
  });

  it('omits consequenceTeamEraId for a concession where neither side conceded', () => {
    const [data] = service.buildAdminEvents(
      buildOptions({
        event: {
          type: 'concession',
          tpEventId: 22,
          instant: 'x',
          concedeLocal: false,
          concedeVisitor: false,
        },
      }),
    );

    expect(data.consequenceType).toBe('concession');
    expect(data.consequenceTeamEraId).toBeUndefined();
  });
});
